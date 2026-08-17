import { useLiveQuery } from "dexie-react-hooks";
import { db, type SavedSearch } from "@/lib/db";

export function useSavedSearches(): SavedSearch[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.savedSearches.toArray();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }, []);
}
