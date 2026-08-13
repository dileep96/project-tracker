import { useLiveQuery } from "dexie-react-hooks";
import { db, type Project } from "@/lib/db";

export function useProjects(): Project[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.projects.toArray();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }, []);
}

/**
 * Undefined while the query hasn't resolved yet, null once resolved with no
 * such project — callers need to tell "still loading" apart from "not found".
 */
export function useProject(id: string | undefined): Project | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    const project = await db.projects.get(id);
    return project ?? null;
  }, [id]);
}

/** Task counts per project, for the projects list — cheap enough to compute live. */
export function useProjectTaskCounts(): Record<string, number> | undefined {
  return useLiveQuery(async () => {
    const tasks = await db.tasks.toArray();
    const counts: Record<string, number> = {};
    for (const t of tasks) counts[t.projectId] = (counts[t.projectId] ?? 0) + 1;
    return counts;
  }, []);
}
