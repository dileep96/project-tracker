import {
  db,
  TASK_PRIORITIES,
  type CustomFieldDef,
  type CustomFieldValue,
  type Milestone,
  type Project,
  type Subtask,
  type Task,
  type TaskDependency,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/db";
import { generateId, now } from "@/lib/ids";
import { createFieldDef } from "@/lib/queries/custom-fields";
import { createTask, type CreateTaskInput } from "@/lib/queries/tasks";
import { normalizeDependencyEdges, wouldCreateCycle, type DependencyEdge } from "@/lib/dependency-graph";
import { EXPORT_FORMAT_VERSION, type ExportBundle, type ExportedProjectBundle } from "@/lib/io/export";

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// JSON import — validate first, write in one atomic transaction, or not at all.
// ---------------------------------------------------------------------------

/**
 * Real shape-checking, not just "did `JSON.parse` succeed" — every required array and cross-
 * reference is checked before a single row is written. Never throws; a malformed file always comes
 * back as `{ ok: false, errors }` with a message specific enough to act on.
 */
export function validateExportBundle(raw: unknown): ValidationResult<ExportBundle> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ["This file isn't a valid export — expected a JSON object, not " + describeType(raw) + "."] };
  }
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (obj.formatVersion !== EXPORT_FORMAT_VERSION) {
    errors.push(`Unrecognized export format version (expected ${EXPORT_FORMAT_VERSION}, got ${JSON.stringify(obj.formatVersion)}).`);
  }
  if (!Array.isArray(obj.globalCustomFieldDefs)) errors.push('Missing or invalid "globalCustomFieldDefs" array.');
  if (!Array.isArray(obj.projects)) {
    errors.push('Missing or invalid "projects" array.');
    return { ok: false, errors };
  }
  const projects = obj.projects;
  if (projects.length === 0) errors.push("This export contains no projects.");
  projects.forEach((p, index) => errors.push(...validateProjectBundle(p, index)));
  if (errors.length === 0) errors.push(...validateNoDependencyCycles(projects as ExportedProjectBundle[]));

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: raw as unknown as ExportBundle };
}

/**
 * `addDependency` (src/lib/queries/tasks.ts) never lets a *live* dependency graph in this app
 * develop a cycle — but an import bundle is untrusted input (hand-edited, or from a future/buggy
 * export version), and `Gantt`'s critical-path pass assumes an acyclic graph (see AGENTS.md). A
 * self-produced export from this app can never contain a cycle, so this only ever rejects a
 * corrupted/hand-crafted file — exactly the "never partially import silent garbage" bar the rest
 * of this validator holds every other field to. Reuses `wouldCreateCycle` (the same check
 * `addDependency` runs before accepting one new live edge) by adding this bundle's edges one at a
 * time and checking each against everything accepted so far, rather than a separate topological
 * sort — one cycle-detection algorithm for the whole app, not two.
 */
function validateNoDependencyCycles(projects: ExportedProjectBundle[]): string[] {
  const allDeps = projects.flatMap((p) => p.dependencies);
  const edges = normalizeDependencyEdges(allDeps);
  const accepted: DependencyEdge[] = [];
  for (const edge of edges) {
    if (wouldCreateCycle(accepted, edge.predecessorId, edge.successorId)) {
      return ["This export contains a circular task dependency, which can't be imported."];
    }
    accepted.push(edge);
  }
  return [];
}

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

const PROJECT_BUNDLE_ARRAY_KEYS = [
  "statuses",
  "customFieldDefs",
  "milestones",
  "tasks",
  "subtasks",
  "customFieldValues",
  "dependencies",
] as const;

function validateProjectBundle(raw: unknown, index: number): string[] {
  const label = `Project #${index + 1}`;
  if (typeof raw !== "object" || raw === null) return [`${label}: not a valid object.`];
  const p = raw as Record<string, unknown>;

  const errors: string[] = [];
  const project = p.project as Record<string, unknown> | undefined;
  if (!project || typeof project !== "object" || typeof project.name !== "string" || !project.name.trim()) {
    errors.push(`${label}: missing a valid project name.`);
  }
  for (const key of PROJECT_BUNDLE_ARRAY_KEYS) {
    if (!Array.isArray(p[key])) errors.push(`${label}: missing or invalid "${key}" array.`);
  }
  if (errors.length > 0) return errors; // shape is too broken to check cross-references below

  const statusIds = new Set((p.statuses as { id?: unknown }[]).map((s) => s.id));
  (p.tasks as Record<string, unknown>[]).forEach((t, i) => {
    if (typeof t.id !== "string" || !t.id) errors.push(`${label}, task #${i + 1}: missing an id.`);
    if (typeof t.title !== "string" || !t.title.trim()) errors.push(`${label}, task #${i + 1}: missing a title.`);
    if (typeof t.statusId !== "string" || !statusIds.has(t.statusId)) {
      errors.push(`${label}, task #${i + 1}: references a status not present in this export.`);
    }
  });
  return errors;
}

/**
 * Materializes every project in a validated bundle as a **brand-new** project (fresh ids
 * throughout — this never overwrites or merges into existing data). Runs as one Dexie transaction:
 * if anything after validation still fails (a truly unexpected error, since shape was already
 * checked), nothing is left half-written. Global custom field defs are resolved by exact
 * name+type match against what already exists in the live database (creating one only if no match
 * is found) so re-importing the same bundle twice doesn't pile up duplicate global fields — the
 * same exact-name-match join `Task.assignee` already uses against `Person`. Cross-project
 * dependency edges (possible in an "export everything" bundle) are inserted in a second pass, after
 * every project's tasks exist, so an edge's target id is always resolvable regardless of which
 * project in the bundle it originally pointed into.
 *
 * **Deliberately does not go through `createTask()` / fire `taskCreated` automations**, unlike CSV
 * task import (`importCsvTasks` below) — a JSON import is a bulk data restore that can materialize
 * dozens of tasks across multiple projects in one action, and firing every project's automation
 * rules against every one of those tasks (a "set status"/"notify" rule could touch or spam far
 * more of them than the person importing intended) would make a restore behave unpredictably
 * differently from the export it came from. CSV import is closer to "type these rows in by hand,"
 * one project at a time, where automations firing matches what typing them in manually would do —
 * see AGENTS.md for the full reasoning behind this asymmetry.
 */
export async function importJsonBundle(bundle: ExportBundle): Promise<Project[]> {
  return db.transaction(
    "rw",
    [db.projects, db.taskStatuses, db.customFieldDefs, db.milestones, db.tasks, db.subtasks, db.customFieldValues, db.taskDependencies],
    async () => {
      const existingGlobalDefs = (await db.customFieldDefs.toArray()).filter((f) => f.projectId === null);
      const globalFieldIdByOldId: Record<string, string> = {};
      for (const def of bundle.globalCustomFieldDefs) {
        const match = existingGlobalDefs.find((e) => e.name === def.name && e.type === def.type);
        if (match) {
          globalFieldIdByOldId[def.id] = match.id;
        } else {
          const created = await createFieldDef({ projectId: null, name: def.name, type: def.type, options: def.options });
          globalFieldIdByOldId[def.id] = created.id;
          existingGlobalDefs.push(created);
        }
      }

      const taskIdMap: Record<string, string> = {};
      const createdProjects: Project[] = [];
      for (const projectBundle of bundle.projects) {
        createdProjects.push(await importProjectSkeleton(projectBundle, globalFieldIdByOldId, taskIdMap));
      }

      const depRows: TaskDependency[] = [];
      for (const projectBundle of bundle.projects) {
        for (const dep of projectBundle.dependencies) {
          const taskId = taskIdMap[dep.taskId];
          const dependsOnTaskId = taskIdMap[dep.dependsOnTaskId];
          if (!taskId || !dependsOnTaskId) continue; // endpoint outside this bundle — dropped, not a partial-import failure
          depRows.push({ id: generateId(), taskId, dependsOnTaskId, type: dep.type, createdAt: now() });
        }
      }
      if (depRows.length > 0) await db.taskDependencies.bulkAdd(depRows);

      return createdProjects;
    }
  );
}

async function importProjectSkeleton(
  bundle: ExportedProjectBundle,
  globalFieldIdByOldId: Record<string, string>,
  taskIdMap: Record<string, string>
): Promise<Project> {
  const timestamp = now();
  const newProjectId = generateId();
  const newProject: Project = { ...bundle.project, id: newProjectId, createdAt: timestamp, updatedAt: timestamp };
  await db.projects.add(newProject);

  const statusIdMap: Record<string, string> = {};
  const statusRows: TaskStatus[] = bundle.statuses.map((s) => {
    const id = generateId();
    statusIdMap[s.id] = id;
    return { ...s, id, projectId: newProjectId, createdAt: timestamp };
  });
  if (statusRows.length > 0) await db.taskStatuses.bulkAdd(statusRows);

  const fieldIdMap: Record<string, string> = {};
  const fieldRows: CustomFieldDef[] = bundle.customFieldDefs.map((f) => {
    const id = generateId();
    fieldIdMap[f.id] = id;
    return { ...f, id, projectId: newProjectId, createdAt: timestamp };
  });
  if (fieldRows.length > 0) await db.customFieldDefs.bulkAdd(fieldRows);

  const milestoneIdMap: Record<string, string> = {};
  const milestoneRows: Milestone[] = bundle.milestones.map((m) => {
    const id = generateId();
    milestoneIdMap[m.id] = id;
    return { ...m, id, projectId: newProjectId, createdAt: timestamp };
  });
  if (milestoneRows.length > 0) await db.milestones.bulkAdd(milestoneRows);

  const taskRows: Task[] = bundle.tasks.map((t) => {
    const id = generateId();
    taskIdMap[t.id] = id;
    const statusId = statusIdMap[t.statusId];
    // Should be unreachable — validateProjectBundle already checked every task's statusId is
    // present in this same bundle's statuses array before importJsonBundle was ever called. Throw
    // rather than silently write an empty-string FK if that invariant is ever violated (e.g. a
    // future caller invokes this without going through validateExportBundle first) — inside this
    // function's transaction, throwing rolls back everything imported so far instead of leaving a
    // task pointing at no real status row.
    if (!statusId) throw new Error(`Import failed: task "${t.title}" references an unknown status.`);
    return {
      ...t,
      id,
      projectId: newProjectId,
      statusId,
      milestoneId: t.milestoneId ? (milestoneIdMap[t.milestoneId] ?? null) : null,
      // A recurring template's generated instances, and the rule that produced them, aren't
      // portable data (recurrenceRules isn't part of the export bundle at all — see AGENTS.md) —
      // every imported task lands as a plain one-off, never mid-recurrence.
      recurrenceParentId: null,
      isRecurring: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
  if (taskRows.length > 0) await db.tasks.bulkAdd(taskRows);

  const subtaskRows: Subtask[] = bundle.subtasks
    .filter((s) => taskIdMap[s.taskId])
    .map((s) => ({ ...s, id: generateId(), taskId: taskIdMap[s.taskId] }));
  if (subtaskRows.length > 0) await db.subtasks.bulkAdd(subtaskRows);

  const valueRows: CustomFieldValue[] = bundle.customFieldValues
    .filter((v) => taskIdMap[v.taskId])
    .map((v) => {
      const newFieldId = fieldIdMap[v.fieldId] ?? globalFieldIdByOldId[v.fieldId];
      return newFieldId ? { id: generateId(), taskId: taskIdMap[v.taskId], fieldId: newFieldId, value: v.value } : null;
    })
    .filter((v): v is CustomFieldValue => v !== null);
  if (valueRows.length > 0) await db.customFieldValues.bulkAdd(valueRows);

  return newProject;
}

// ---------------------------------------------------------------------------
// CSV task import — same file dialect `exportRowsAsCsv` (report.ts) writes.
// ---------------------------------------------------------------------------

/**
 * Minimal RFC 4180 CSV parser — handles quoted fields, embedded commas, doubled-quote escapes, and
 * a quoted embedded newline (the exact dialect `csvCell`/`exportRowsAsCsv` in `lib/analytics/
 * report.ts` write). Hand-rolled for the same reason CSV export is hand-rolled there: small enough
 * not to need a dependency.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;
  while (i < len) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (char === "\r") {
      i++;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += char;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

function parseCsvDate(raw: string | undefined): { ok: true; value: number | null } | { ok: false } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: null };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return { ok: false };
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return { ok: false };
  return { ok: true, value: date.getTime() };
}

export interface CsvTaskImportOptions {
  projectId: string;
  /** This project's own statuses — a "Status" column value is resolved against these by name (case-insensitive). */
  statuses: TaskStatus[];
}

/**
 * Parses + validates every row before anything is imported — **all-or-nothing**: a single bad row
 * (missing title, unrecognized status/priority, unparseable date) fails the whole file with a
 * specific per-row message, never a partial import of just the good rows. Column order doesn't
 * matter — headers are matched case-insensitively by name against the same header set
 * `exportRowsAsCsv` writes; only "Title" is required, every other column is optional. A "Project"
 * column, if present, is ignored — the target project is whatever the caller already picked (see
 * `ImportCsvTasksDialog`), not re-derived from the file.
 */
export function validateAndParseCsvTasks(text: string, options: CsvTaskImportOptions): ValidationResult<CreateTaskInput[]> {
  const rows = parseCsv(text.trim());
  if (rows.length === 0) return { ok: false, errors: ["The file is empty."] };
  const [headerRow, ...dataRows] = rows;
  const header = headerRow.map((h) => h.trim().toLowerCase());
  const titleIndex = header.indexOf("title");
  if (titleIndex === -1) return { ok: false, errors: ['CSV is missing a required "Title" column.'] };
  const statusIndex = header.indexOf("status");
  const priorityIndex = header.indexOf("priority");
  const assigneeIndex = header.indexOf("assignee");
  const startIndex = header.indexOf("start date");
  const dueIndex = header.indexOf("due date");
  const tagsIndex = header.indexOf("tags");

  const defaultStatus = options.statuses.find((s) => s.isDefault) ?? options.statuses[0];
  if (!defaultStatus) return { ok: false, errors: ["This project has no task statuses to import into."] };
  const statusByName = new Map(options.statuses.map((s) => [s.name.toLowerCase(), s]));

  const errors: string[] = [];
  const inputs: CreateTaskInput[] = [];

  dataRows.forEach((cells, i) => {
    if (cells.every((c) => c.trim() === "")) return; // skip fully blank rows silently
    const rowLabel = `Row ${i + 2}`; // +2: header is row 1, data is 1-indexed from there

    const title = cells[titleIndex]?.trim() ?? "";
    if (!title) {
      errors.push(`${rowLabel}: missing a title.`);
      return;
    }

    let statusId = defaultStatus.id;
    if (statusIndex !== -1) {
      const statusName = cells[statusIndex]?.trim();
      if (statusName) {
        const match = statusByName.get(statusName.toLowerCase());
        if (!match) {
          errors.push(`${rowLabel}: status "${statusName}" doesn't exist in this project.`);
          return;
        }
        statusId = match.id;
      }
    }

    let priority: TaskPriority = "medium";
    if (priorityIndex !== -1) {
      const raw = cells[priorityIndex]?.trim().toLowerCase();
      if (raw) {
        if (!TASK_PRIORITIES.includes(raw as TaskPriority)) {
          errors.push(`${rowLabel}: invalid priority "${raw}".`);
          return;
        }
        priority = raw as TaskPriority;
      }
    }

    const startResult = startIndex !== -1 ? parseCsvDate(cells[startIndex]) : ({ ok: true, value: null } as const);
    if (!startResult.ok) {
      errors.push(`${rowLabel}: invalid start date "${cells[startIndex]}" (expected YYYY-MM-DD).`);
      return;
    }
    const dueResult = dueIndex !== -1 ? parseCsvDate(cells[dueIndex]) : ({ ok: true, value: null } as const);
    if (!dueResult.ok) {
      errors.push(`${rowLabel}: invalid due date "${cells[dueIndex]}" (expected YYYY-MM-DD).`);
      return;
    }

    inputs.push({
      projectId: options.projectId,
      title,
      statusId,
      priority,
      assignee: assigneeIndex !== -1 ? (cells[assigneeIndex]?.trim() ?? "") : "",
      tags: tagsIndex !== -1 ? (cells[tagsIndex] ?? "").split(",").map((t) => t.trim()).filter(Boolean) : [],
      startDate: startResult.value,
      dueDate: dueResult.value,
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  if (inputs.length === 0) return { ok: false, errors: ["No task rows found in this file."] };
  return { ok: true, value: inputs };
}

/**
 * Writes every already-validated row via the normal `createTask()` query function (not a bulk
 * transaction) — deliberately, so each imported task fires the same `taskCreated` automations and
 * activity-log behavior a manually-created task would. Safe to do sequentially rather than
 * atomically: by the time this runs, `validateAndParseCsvTasks` has already accepted every row, so
 * the only remaining failure mode is a genuinely unexpected runtime error, not a validation gap —
 * the "never partially import silent garbage" guarantee lives in the validation pass, not here.
 */
export async function importCsvTasks(inputs: CreateTaskInput[]): Promise<number> {
  for (const input of inputs) await createTask(input);
  return inputs.length;
}
