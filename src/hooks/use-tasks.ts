import { useLiveQuery } from "dexie-react-hooks";
import { db, type Task } from "@/lib/db";

export function useProjectTasks(projectId: string | undefined): Task[] | undefined {
  return useLiveQuery(
    () => (projectId ? db.tasks.where("projectId").equals(projectId).toArray() : []),
    [projectId]
  );
}

export function useAllTasks(): Task[] | undefined {
  return useLiveQuery(() => db.tasks.toArray(), []);
}

export function useTask(id: string | undefined): Task | undefined {
  return useLiveQuery(() => (id ? db.tasks.get(id) : undefined), [id]);
}
