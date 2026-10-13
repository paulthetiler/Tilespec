import type { Location } from "./types";
import { ValidationError } from "./validation";

export type LocationIndex = Map<string, Location>;

export function indexLocations(locations: Location[]): LocationIndex {
  return new Map(locations.map(location => [location.id, location]));
}

// "Block B › Level 5 › Flat 52 › Bathroom". Ancestors hidden from the reader by
// row-level security are left out rather than shown as identifiers.
export function locationPath(index: LocationIndex, id: string, separator = " › "): string {
  const location = index.get(id);
  if (!location) return "";
  return location.path_ids.map(ancestor => index.get(ancestor)?.name).filter((name): name is string => Boolean(name)).join(separator);
}

const byOrderThenName = (a: Location, b: Location) =>
  a.sort_order - b.sort_order || a.name.localeCompare(b.name, "en-GB", { numeric: true, sensitivity: "base" });

// Depth-first, so the hierarchy can be shown as an indented list. A location
// whose parent is not visible is treated as a top-level entry.
export function orderLocations(locations: Location[]): Location[] {
  const index = indexLocations(locations);
  const children = new Map<string | null, Location[]>();
  for (const location of locations) {
    const parent = location.parent_id && index.has(location.parent_id) ? location.parent_id : null;
    children.set(parent, [...(children.get(parent) ?? []), location]);
  }
  const ordered: Location[] = [];
  const visit = (parent: string | null) => {
    for (const child of (children.get(parent) ?? []).sort(byOrderThenName)) {
      ordered.push(child);
      visit(child.id);
    }
  };
  visit(null);
  return ordered;
}

const tokens = (text: string) => text.toLocaleLowerCase("en-GB").split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// Every word must appear in the location's path or code, so "52 bath" finds
// Flat 52 › Bathroom. Best matches come first: words starting the location's
// own name ("level 5" finds Level 5 itself), then words starting anywhere in
// its path, then any substring; shallower locations first within each group.
// Archived locations are excluded unless requested.
export function searchLocations(index: LocationIndex, query: string, options: { limit?: number; includeArchived?: boolean } = {}): Location[] {
  const words = tokens(query);
  if (words.length === 0) return [];
  const startsAll = (list: string[]) => words.every(word => list.some(token => token.startsWith(word)));
  const ranked: { location: Location; tier: number; order: number }[] = [];
  orderLocations([...index.values()]).forEach((location, order) => {
    if (location.archived_at && !options.includeArchived) return;
    const own = tokens(`${location.name} ${location.code}`);
    const path = [...tokens(locationPath(index, location.id, " ")), ...own];
    const tier = startsAll(own) ? 0 : startsAll(path) ? 1 : words.every(word => path.join(" ").includes(word)) ? 2 : -1;
    if (tier >= 0) ranked.push({ location, tier, order });
  });
  return ranked.sort((a, b) => a.tier - b.tier || a.location.path_ids.length - b.location.path_ids.length || a.order - b.order)
    .slice(0, options.limit ?? 50).map(item => item.location);
}

export type LocationItem = { name: string; location_type?: string; children?: LocationItem[] };
export type LocationBuilderInput = {
  mode: "series" | "names"; label: string; from: string; to: string; names: string; rooms: string;
};
export const MAX_LOCATIONS_PER_REQUEST = 2000;
export const MAX_LOCATIONS_PER_LEVEL = 500;

// One per line or comma separated; blanks and repeats (ignoring case) are dropped.
export function splitNames(text: string): string[] {
  const seen = new Set<string>();
  return text.split(/[\n,]/).map(name => name.trim().replace(/\s+/g, " ")).filter(name => {
    const key = name.toLocaleLowerCase("en-GB");
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Turns "Flat, 51 to 58, each with Bathroom and Kitchen" or a typed list of
// names into the nested items create_locations expects. Used for the live
// preview and again on the server, which never trusts the browser's version.
export function buildLocationItems(input: LocationBuilderInput): { items: LocationItem[]; total: number } {
  const label = input.label.trim().replace(/\s+/g, " ");
  const rooms = splitNames(input.rooms);
  if (label.length > 60) throw new ValidationError("Keep the label to 60 characters, for example Flat or Level.");
  let names: string[];
  if (input.mode === "series") {
    if (!/^\d{1,6}$/.test(input.from.trim()) || !/^\d{1,6}$/.test(input.to.trim())) throw new ValidationError("Enter whole numbers for the first and last number.");
    const from = Number(input.from.trim()), to = Number(input.to.trim());
    if (to < from) throw new ValidationError("The last number must be the same as or after the first.");
    if (to - from + 1 > MAX_LOCATIONS_PER_LEVEL) throw new ValidationError(`Create at most ${MAX_LOCATIONS_PER_LEVEL} at a time.`);
    // "01" to "12" keeps the leading zero: Room 01 ... Room 12.
    const width = input.from.trim().startsWith("0") ? input.from.trim().length : 0;
    names = Array.from({ length: to - from + 1 }, (_, index) => `${label} ${String(from + index).padStart(width, "0")}`.trim());
  } else {
    names = splitNames(input.names);
    if (names.length === 0) throw new ValidationError("Enter at least one location name.");
    if (names.length > MAX_LOCATIONS_PER_LEVEL) throw new ValidationError(`Create at most ${MAX_LOCATIONS_PER_LEVEL} at a time.`);
  }
  if ([...names, ...rooms].some(name => name.length > 160)) throw new ValidationError("Each location name must be 160 characters or fewer.");
  const total = names.length * (1 + rooms.length);
  if (total > MAX_LOCATIONS_PER_REQUEST) throw new ValidationError(`That would create ${total.toLocaleString("en-GB")} locations; the limit per request is ${MAX_LOCATIONS_PER_REQUEST.toLocaleString("en-GB")}.`);
  const items = names.map(name => ({
    name, ...(label ? { location_type: label } : {}),
    ...(rooms.length ? { children: rooms.map(room => ({ name: room })) } : {}),
  }));
  return { items, total };
}

// IDs of a location and everything inside it, for "move to" choices that would
// otherwise place a location inside itself.
export function subtreeIds(locations: Location[], id: string): Set<string> {
  return new Set(locations.filter(location => location.path_ids.includes(id)).map(location => location.id));
}
