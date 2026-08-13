import { useLiveQuery } from "dexie-react-hooks";
import { db, type Milestone } from "@/lib/db";

export function useMilestones(projectId: string | undefined): Milestone[] | undefined {
  return useLiveQuery(async () => {
    if (!projectId) return [];
    const rows = await db.milestones.where("projectId").equals(projectId).toArray();
    return rows.sort((a, b) => a.targetDate - b.targetDate);
  }, [projectId]);
}
