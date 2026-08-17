import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { mergeActivityFeed, type ActivityItem } from "@/lib/analytics/activity";

export type ActivityScope = { type: "task"; taskId: string } | { type: "project"; projectId: string };

function scopeKey(scope: ActivityScope | undefined): string | undefined {
  if (!scope) return undefined;
  return scope.type === "task" ? `task:${scope.taskId}` : `project:${scope.projectId}`;
}

/**
 * The unified per-task / per-project activity feed: field changes + comments + automation firings,
 * scoped and merged. A project scope pulls in every one of its tasks' rows too (via `projectId`,
 * denormalized on `Comment`/`FieldChangeLogEntry` for exactly this), so a project's feed is already
 * the "combined" view the brief calls for — not a fourth, separate page.
 */
export function useActivityFeed(scope: ActivityScope | undefined): ActivityItem[] | undefined {
  const key = scopeKey(scope);

  const fieldChanges = useLiveQuery(async () => {
    if (!scope) return [];
    return scope.type === "task"
      ? db.fieldChangeLog.where("entityId").equals(scope.taskId).toArray()
      : db.fieldChangeLog.where("projectId").equals(scope.projectId).toArray();
  }, [key]);

  const comments = useLiveQuery(async () => {
    if (!scope) return [];
    return scope.type === "task"
      ? db.comments.where("entityId").equals(scope.taskId).toArray()
      : db.comments.where("projectId").equals(scope.projectId).toArray();
  }, [key]);

  const automationLog = useLiveQuery(async () => {
    if (!scope) return [];
    return scope.type === "task"
      ? db.automationRunLog.where("taskId").equals(scope.taskId).toArray()
      : db.automationRunLog.where("projectId").equals(scope.projectId).toArray();
  }, [key]);

  return useMemo(() => {
    if (fieldChanges === undefined || comments === undefined || automationLog === undefined) return undefined;
    return mergeActivityFeed(fieldChanges, comments, automationLog);
  }, [fieldChanges, comments, automationLog]);
}
