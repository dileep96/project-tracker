import { useLiveQuery } from "dexie-react-hooks";
import { db, type CustomFieldDef } from "@/lib/db";

export function useCustomFieldDefs(projectId: string | undefined): CustomFieldDef[] | undefined {
  return useLiveQuery(async () => {
    if (!projectId) return [];
    const all = await db.customFieldDefs.toArray();
    return all
      .filter((f) => f.projectId === null || f.projectId === projectId)
      .sort((a, b) => a.order - b.order);
  }, [projectId]);
}
