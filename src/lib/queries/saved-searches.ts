import { db, type SavedSearch, type SavedSearchQuery } from "@/lib/db";
import { generateId, now } from "@/lib/ids";

/** Same shape as `report-views.ts`'s saved-view CRUD (Phase 3) — see AGENTS.md, this is the intended copy-paste template for any future "saved X" feature. */
export async function listSavedSearches(): Promise<SavedSearch[]> {
  const rows = await db.savedSearches.toArray();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createSavedSearch(name: string, query: SavedSearchQuery): Promise<SavedSearch> {
  const timestamp = now();
  const row: SavedSearch = { id: generateId(), name, query, createdAt: timestamp, updatedAt: timestamp };
  await db.savedSearches.add(row);
  return row;
}

export async function deleteSavedSearch(id: string): Promise<void> {
  await db.savedSearches.delete(id);
}
