import { useLiveQuery } from "dexie-react-hooks";
import { db, type TaskStatus } from "@/lib/db";

export function useTaskStatuses(projectId: string | undefined): TaskStatus[] | undefined {
  return useLiveQuery(async () => {
    if (!projectId) return [];
    const rows = await db.taskStatuses.where("projectId").equals(projectId).toArray();
    return rows.sort((a, b) => a.order - b.order);
  }, [projectId]);
}

/** All statuses across all projects, keyed by id — handy for the all-projects table which spans many workflows. */
export function useAllTaskStatusesById(): Record<string, TaskStatus> | undefined {
  return useLiveQuery(async () => {
    const rows = await db.taskStatuses.toArray();
    return Object.fromEntries(rows.map((s) => [s.id, s]));
  }, []);
}

/** Same data, grouped by project and ordered — what the all-projects table needs to build a per-row status editor. */
export function useAllTaskStatusesByProject(): Record<string, TaskStatus[]> | undefined {
  return useLiveQuery(async () => {
    const rows = await db.taskStatuses.toArray();
    const grouped: Record<string, TaskStatus[]> = {};
    for (const s of rows) (grouped[s.projectId] ??= []).push(s);
    for (const list of Object.values(grouped)) list.sort((a, b) => a.order - b.order);
    return grouped;
  }, []);
}
