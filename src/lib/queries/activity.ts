import {
  db,
  type FieldChangeLogEntry,
  type Project,
  type Task,
  type TrackedProjectField,
  type TrackedTaskField,
} from "@/lib/db";
import { generateId, now } from "@/lib/ids";

const TRACKED_TASK_FIELDS: TrackedTaskField[] = [
  "title",
  "statusId",
  "priority",
  "assignee",
  "startDate",
  "dueDate",
  "completedAt",
];
const TRACKED_PROJECT_FIELDS: TrackedProjectField[] = ["name", "status", "health"];

/** Whether a `Task` update patch touches at least one tracked field — the signal `updateTask` uses to decide whether it's worth fetching the pre-update row at all. */
export function taskPatchTouchesTrackedFields(patch: Partial<Task>): boolean {
  return TRACKED_TASK_FIELDS.some((field) => field in patch);
}

/** Same as `taskPatchTouchesTrackedFields`, for `Project` updates. */
export function projectPatchTouchesTrackedFields(patch: Partial<Project>): boolean {
  return TRACKED_PROJECT_FIELDS.some((field) => field in patch);
}

const logDateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

function formatLogDate(value: number | null): string {
  return value === null ? "—" : logDateFormatter.format(value);
}

type PendingEntry = Omit<FieldChangeLogEntry, "id" | "changedAt">;

/**
 * Diffs a pre-update `Task` against the patch `updateTask` is about to apply and writes one
 * `fieldChangeLog` row per tracked field that actually changed value (a patch that re-sends the
 * same value, e.g. an inline-edit cell blurring without a real edit, writes nothing). Resolves
 * `statusId` to the status's own `name` — never the raw id — by reading `taskStatuses` directly,
 * since the log needs to stay readable even if that status is later renamed or deleted. Called
 * fire-and-forget from `updateTask`, same as the automation triggers it already fires that way.
 */
export async function recordTaskFieldChanges(before: Task, patch: Partial<Task>): Promise<void> {
  const entries: PendingEntry[] = [];
  const entityTitle = patch.title ?? before.title;
  const push = (field: TrackedTaskField, fromValue: string | null, toValue: string | null) => {
    if (fromValue === toValue) return;
    entries.push({ entityType: "task", entityId: before.id, projectId: before.projectId, entityTitle, field, fromValue, toValue });
  };

  if (patch.title !== undefined) push("title", before.title, patch.title);
  if (patch.priority !== undefined) push("priority", before.priority, patch.priority);
  if (patch.assignee !== undefined) push("assignee", before.assignee || "Unassigned", patch.assignee || "Unassigned");
  if (patch.startDate !== undefined) push("startDate", formatLogDate(before.startDate), formatLogDate(patch.startDate));
  if (patch.dueDate !== undefined) push("dueDate", formatLogDate(before.dueDate), formatLogDate(patch.dueDate));
  if (patch.completedAt !== undefined && (patch.completedAt !== null) !== (before.completedAt !== null)) {
    push("completedAt", before.completedAt !== null ? "Completed" : "Not completed", patch.completedAt !== null ? "Completed" : "Not completed");
  }
  if (patch.statusId !== undefined && patch.statusId !== before.statusId) {
    const [fromStatus, toStatus] = await Promise.all([db.taskStatuses.get(before.statusId), db.taskStatuses.get(patch.statusId)]);
    push("statusId", fromStatus?.name ?? "Unknown status", toStatus?.name ?? "Unknown status");
  }

  if (entries.length === 0) return;
  const changedAt = now();
  await db.fieldChangeLog.bulkAdd(entries.map((entry) => ({ ...entry, id: generateId(), changedAt })));
}

/** Same idea as `recordTaskFieldChanges`, for `Project` updates — see that function's doc comment. */
export async function recordProjectFieldChanges(before: Project, patch: Partial<Project>): Promise<void> {
  const entries: PendingEntry[] = [];
  const entityTitle = patch.name ?? before.name;
  const push = (field: TrackedProjectField, fromValue: string | null, toValue: string | null) => {
    if (fromValue === toValue) return;
    entries.push({ entityType: "project", entityId: before.id, projectId: before.id, entityTitle, field, fromValue, toValue });
  };

  if (patch.name !== undefined) push("name", before.name, patch.name);
  if (patch.status !== undefined) push("status", before.status, patch.status);
  if (patch.health !== undefined) push("health", before.health, patch.health);

  if (entries.length === 0) return;
  const changedAt = now();
  await db.fieldChangeLog.bulkAdd(entries.map((entry) => ({ ...entry, id: generateId(), changedAt })));
}

/** Every field-change row for one task or project — the per-task/per-project activity tab's own history. */
export async function listFieldChangesForEntity(entityId: string): Promise<FieldChangeLogEntry[]> {
  return db.fieldChangeLog.where("entityId").equals(entityId).toArray();
}

/** Every field-change row scoped to a project — its own plus every one of its tasks' (see `FieldChangeLogEntry.projectId`) — what the project's *combined* activity tab reads. */
export async function listFieldChangesForProject(projectId: string): Promise<FieldChangeLogEntry[]> {
  return db.fieldChangeLog.where("projectId").equals(projectId).toArray();
}
