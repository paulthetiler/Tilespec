import type { Location } from "./types";

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

// Every word must appear in the location's path or code, so "52 bath" finds
// Flat 52 › Bathroom. Archived locations are excluded unless requested.
export function searchLocations(index: LocationIndex, query: string, options: { limit?: number; includeArchived?: boolean } = {}): Location[] {
  const words = query.toLocaleLowerCase("en-GB").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const matches: Location[] = [];
  for (const location of orderLocations([...index.values()])) {
    if (location.archived_at && !options.includeArchived) continue;
    const haystack = `${locationPath(index, location.id, " ")} ${location.code}`.toLocaleLowerCase("en-GB");
    if (words.every(word => haystack.includes(word))) matches.push(location);
    if (matches.length >= (options.limit ?? 50)) break;
  }
  return matches;
}
