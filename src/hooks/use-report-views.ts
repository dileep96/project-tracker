import { useLiveQuery } from "dexie-react-hooks";
import { db, type SavedReportView } from "@/lib/db";

export function useSavedReportViews(): SavedReportView[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.savedReportViews.toArray();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }, []);
}
