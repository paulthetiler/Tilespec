import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indexLocations, locationPath, orderLocations, searchLocations } from "../lib/operations/locations";
import { allocationDeviations, installationStages, type Location } from "../lib/operations/types";

let sequence = 0;
function location(name: string, parent: Location | null, extra: Partial<Location> = {}): Location {
  const id = `loc-${++sequence}`;
  return {
    id, contract_id: "contract", name, location: "", substrate_notes: "", system_notes: "", specification_revision: "unapproved",
    parent_id: parent?.id ?? null, path_ids: [...(parent?.path_ids ?? []), id], location_type: "", code: "", sort_order: 0, version: 1,
    archived_at: null, ...extra,
  };
}

// An apartment block large enough to resemble real use: 6 levels x 10 flats x 3 rooms.
const block = location("Block B", null, { code: "B" });
const all: Location[] = [block];
for (let level = 1; level <= 6; level++) {
  const levelLocation = location(`Level ${level}`, block, { sort_order: level });
  all.push(levelLocation);
  for (let flat = 1; flat <= 10; flat++) {
    const flatLocation = location(`Flat ${level}${String(flat).padStart(2, "0")}`, levelLocation, { sort_order: flat, code: `${level}${String(flat).padStart(2, "0")}` });
    all.push(flatLocation, location("Bathroom", flatLocation, { sort_order: 1 }), location("Kitchen", flatLocation, { sort_order: 2 }), location("Ensuite", flatLocation, { sort_order: 3 }));
  }
}
const index = indexLocations(all);
const find = (path: string) => all.find(candidate => locationPath(index, candidate.id) === path)!;

test("a room is shown with its full readable hierarchy", () => {
  assert.equal(locationPath(index, find("Block B › Level 5 › Flat 502 › Bathroom").id), "Block B › Level 5 › Flat 502 › Bathroom");
  assert.equal(all.length, 1 + 6 + 6 * 10 * 4);
});

test("ancestors hidden by row-level security are omitted, never shown as identifiers", () => {
  const visible = [find("Block B › Level 5 › Flat 502"), find("Block B › Level 5 › Flat 502 › Bathroom")];
  const partial = indexLocations(visible);
  assert.equal(locationPath(partial, visible[1].id), "Flat 502 › Bathroom");
  assert.deepEqual(orderLocations(visible).map(item => item.name), ["Flat 502", "Bathroom"]);
});

test("search finds a particular flat's room from a few typed characters", () => {
  const results = searchLocations(index, "502 bath");
  assert.deepEqual(results.map(item => locationPath(index, item.id)), ["Block B › Level 5 › Flat 502 › Bathroom"]);
  assert.equal(searchLocations(index, "  ").length, 0);
  assert.equal(searchLocations(index, "ensuite", { limit: 5 }).length, 5);
});

test("search puts the location you named first, not things that merely contain the number", () => {
  const level5 = searchLocations(index, "level 5", { limit: 3 }).map(item => locationPath(index, item.id));
  assert.equal(level5[0], "Block B › Level 5");
  const five = searchLocations(index, "5", { limit: 12 }).map(item => item.name);
  assert.equal(five[0], "Level 5");
  assert.ok(five.indexOf("Flat 501") >= 0 && !five.includes("Flat 105"), "Flat 105 only matches inside a word, so it ranks below whole-number matches");
  assert.deepEqual(searchLocations(index, "room").map(item => item.name).slice(0, 1), ["Bathroom"]);
});

test("archived locations are excluded from search unless requested", () => {
  // Archiving cascades to the subtree in the database, so the rooms are archived too.
  const flat601 = find("Block B › Level 6 › Flat 601");
  const archivedIndex = indexLocations(all.map(item => item.path_ids.includes(flat601.id) ? { ...item, archived_at: "2026-10-01T09:00:00Z" } : item));
  assert.equal(searchLocations(archivedIndex, "flat 601").length, 0);
  assert.equal(searchLocations(archivedIndex, "flat 601", { includeArchived: true }).length, 4);
});

test("locations are ordered depth-first by sort order, then naturally by name", () => {
  const ordered = orderLocations([...all].reverse()).slice(0, 4).map(item => item.name);
  assert.deepEqual(ordered, ["Block B", "Level 1", "Flat 101", "Bathroom"]);
  const showroom = location("Ground floor", null);
  const unordered = [location("Bay 10", showroom), location("Bay 9", showroom), location("Bay 2", showroom)];
  assert.deepEqual(orderLocations([showroom, ...unordered]).map(item => item.name), ["Ground floor", "Bay 2", "Bay 9", "Bay 10"]);
});

test("TypeScript stage and deviation lists match the database definitions", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20261014093000_site_allocations.sql", import.meta.url), "utf8");
  const quoted = (fragment: string) => [...fragment.matchAll(/'([a-z_]+)'/g)].map(match => match[1]);
  const stages = migration.match(/function private\.installation_stages\(\)[\s\S]*?select array\[([^\]]+)\]/);
  const deviations = migration.match(/deviations <@ array\[([^\]]+)\]/);
  assert.ok(stages && deviations, "definitions not found in migration");
  assert.deepEqual(quoted(stages[1]), [...installationStages]);
  assert.deepEqual(quoted(deviations[1]), [...allocationDeviations]);
});
