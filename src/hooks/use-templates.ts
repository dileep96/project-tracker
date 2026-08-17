import { useLiveQuery } from "dexie-react-hooks";
import { db, type ProjectTemplate } from "@/lib/db";

export function useTemplates(): ProjectTemplate[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.projectTemplates.toArray();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }, []);
}
