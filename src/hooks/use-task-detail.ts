import { useLiveQuery } from "dexie-react-hooks";
import { db, type Subtask, type Attachment, type TaskDependency, type RecurrenceRule } from "@/lib/db";

export function useSubtasks(taskId: string | undefined): Subtask[] | undefined {
  return useLiveQuery(async () => {
    if (!taskId) return [];
    const rows = await db.subtasks.where("taskId").equals(taskId).toArray();
    return rows.sort((a, b) => a.order - b.order);
  }, [taskId]);
}

export function useAttachments(taskId: string | undefined): Attachment[] | undefined {
  return useLiveQuery(async () => {
    if (!taskId) return [];
    const rows = await db.attachments.where("taskId").equals(taskId).toArray();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }, [taskId]);
}

export function useDependencies(taskId: string | undefined): TaskDependency[] | undefined {
  return useLiveQuery(
    () => (taskId ? db.taskDependencies.where("taskId").equals(taskId).toArray() : []),
    [taskId]
  );
}

export function useRecurrenceRule(taskId: string | undefined): RecurrenceRule | undefined {
  return useLiveQuery(
    () => (taskId ? db.recurrenceRules.where("taskId").equals(taskId).first() : undefined),
    [taskId]
  );
}

export function useCustomFieldValues(taskId: string | undefined): Record<string, string> | undefined {
  return useLiveQuery(async () => {
    if (!taskId) return {};
    const rows = await db.customFieldValues.where("taskId").equals(taskId).toArray();
    return Object.fromEntries(rows.map((r) => [r.fieldId, r.value]));
  }, [taskId]);
}
