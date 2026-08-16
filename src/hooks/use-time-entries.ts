import { useLiveQuery } from "dexie-react-hooks";
import { db, type ActiveTimer, type TimeEntry } from "@/lib/db";

export function useAllTimeEntries(): TimeEntry[] | undefined {
  return useLiveQuery(() => db.timeEntries.toArray(), []);
}

export function useTimeEntriesForTask(taskId: string | undefined): TimeEntry[] | undefined {
  return useLiveQuery(async () => {
    if (!taskId) return [];
    const rows = await db.timeEntries.where("taskId").equals(taskId).toArray();
    return rows.sort((a, b) => b.date - a.date);
  }, [taskId]);
}

export function useTimeEntriesForProject(projectId: string | undefined): TimeEntry[] | undefined {
  return useLiveQuery(async () => {
    if (!projectId) return [];
    return db.timeEntries.where("projectId").equals(projectId).toArray();
  }, [projectId]);
}

/**
 * The single global running timer, or undefined when none is running. `startedAt` on the row is
 * the source of truth for elapsed time — this hook just exposes the row live; components that
 * need a ticking display re-render themselves on an interval and recompute `Date.now() -
 * startedAt` each tick rather than storing elapsed time anywhere.
 */
export function useActiveTimer(): ActiveTimer | undefined {
  return useLiveQuery(() => db.activeTimers.get("current"), []);
}
