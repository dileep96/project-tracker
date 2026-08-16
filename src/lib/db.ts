import Dexie, { type EntityTable } from "dexie";

/**
 * ---------------------------------------------------------------------------
 * Domain types
 * ---------------------------------------------------------------------------
 * These mirror the Dexie schema below. Every record carries plain epoch-ms
 * timestamps (not Date objects) so IndexedDB indexes on them sort correctly
 * and Phase 3's analytics dashboard can aggregate by date without conversion.
 */

export type ProjectHealth = "green" | "amber" | "red";

export interface Project {
  id: string;
  name: string;
  description: string;
  /** Free text — no multi-user auth in this phase. */
  owner: string;
  /** Free text with suggested defaults (see PROJECT_STATUS_SUGGESTIONS); not a fixed enum. */
  status: string;
  health: ProjectHealth;
  /** Dollar budget estimate for the whole project, or null when unset. Added in schema v4 — the top-down number the Budget tab and the dashboard's "Budget burn rate" KPI compare actual cost against. See `lib/analytics/budget.ts`. */
  budgetEstimate: number | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * A project's own task workflow (e.g. "To Do" / "In Progress" / "Done").
 * Each project owns its own ordered list, seeded with a default set on
 * project creation and fully editable afterward. Tasks reference the
 * status's `id`, not its name, so renaming a status never orphans data —
 * and this table doubles as the column model Phase 2's Kanban board reads.
 */
export interface TaskStatus {
  id: string;
  projectId: string;
  name: string;
  order: number;
  isDefault: boolean;
  createdAt: number;
}

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  priority: TaskPriority;
  /** Epoch ms, or null when unset. */
  startDate: number | null;
  dueDate: number | null;
  /** FK -> TaskStatus.id (always scoped to this task's own projectId). */
  statusId: string;
  /** Free text, filterable — no multi-user auth in this phase. */
  assignee: string;
  tags: string[];
  /** FK -> Milestone.id, optional. */
  milestoneId: string | null;
  isRecurring: boolean;
  /**
   * FK -> Task.id of the recurring "template" task this instance was generated from, or null for
   * a normal task (including the template itself — the template keeps isRecurring/its rule, its
   * generated instances do not). Added in schema v2; see README's recurring-generation section.
   */
  recurrenceParentId: string | null;
  /**
   * Hours of effort estimated for this task, or null when unestimated. Added in schema v4 — the
   * input every Phase 4 capacity/workload/budget computation is built on (see
   * `lib/analytics/capacity.ts` and `lib/analytics/budget.ts`). Deliberately effort hours, not a
   * date-range duration — a task can span two weeks calendar-wise while representing 3 hours of
   * actual work, and capacity planning needs the effort number, not the span.
   */
  estimatedHours: number | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface Subtask {
  id: string;
  taskId: string;
  text: string;
  done: boolean;
  order: number;
}

export type CustomFieldType = "text" | "number" | "date" | "select" | "checkbox";

export interface CustomFieldDef {
  id: string;
  /** null = available on every project; otherwise scoped to one project. */
  projectId: string | null;
  name: string;
  type: CustomFieldType;
  /** Only used when type === "select". */
  options: string[] | null;
  order: number;
  createdAt: number;
}

/** One value per (task, field) pair. Value is always stored as a string and parsed per field type on read. */
export interface CustomFieldValue {
  id: string;
  taskId: string;
  fieldId: string;
  value: string;
}

export interface Attachment {
  id: string;
  taskId: string;
  filename: string;
  mimeType: string;
  blob: Blob;
  size: number;
  createdAt: number;
}

export type DependencyType = "blocks" | "blocked-by";

/**
 * dependsOnTaskId intentionally has no project-scoping constraint — a task
 * may depend on a task that lives in a different project entirely.
 */
export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  type: DependencyType;
  createdAt: number;
}

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type RecurrenceEndType = "never" | "onDate" | "afterCount";

/**
 * The rule is stored in full from Phase 1 on; only *generating* recurring
 * task instances from it is deferred to Phase 2, so this table needs no
 * breaking migration later.
 */
export interface RecurrenceRule {
  id: string;
  taskId: string;
  frequency: RecurrenceFrequency;
  interval: number;
  endType: RecurrenceEndType;
  endDate: number | null;
  endCount: number | null;
  createdAt: number;
}

export type MilestoneStatus = "upcoming" | "at-risk" | "completed" | "missed";

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  targetDate: number;
  status: MilestoneStatus;
  createdAt: number;
}

/**
 * The Phase 3 report builder's filter state, persisted verbatim so a saved view reproduces the
 * exact same task subset on reload. `null` means "no constraint" for every field — never an
 * empty-string sentinel — so a saved view survives a status/tag being renamed or removed without
 * silently matching everything.
 */
export interface ReportFilters {
  projectId: string | null;
  statusName: string | null;
  priority: TaskPriority | null;
  assignee: string | null;
  dateField: "dueDate" | "startDate" | "createdAt" | "completedAt";
  dateFrom: number | null;
  dateTo: number | null;
}

/** A saved report-builder filter set (Phase 3). Re-running it re-queries live tasks — it stores the filter, not a result snapshot. */
export interface SavedReportView {
  id: string;
  name: string;
  filters: ReportFilters;
  createdAt: number;
  updatedAt: number;
}

/**
 * A first-class person record (Phase 4). `Task.assignee` stays free text — deliberately not
 * turned into a `personId` foreign key — so this table joins to tasks by exact `name` match
 * rather than by id. See README's Phase 4 section and AGENTS.md for the full rationale: it
 * avoids a breaking migration on the app's most-edited field, at the cost of a person rename
 * going stale on already-assigned tasks until they're reassigned (surfaced in the Workload view
 * as an "unmatched assignee", never silently dropped).
 */
export interface Person {
  id: string;
  name: string;
  /** Hours available per week; a part-time person is just a lower number here, not a separate flag. */
  weeklyCapacityHours: number;
  /** Dollars per hour, used to derive actual cost from logged time (see `lib/analytics/budget.ts`). 0 = unrated. */
  hourlyRate: number;
  /** Inactive people are hidden from pickers but keep their historical time entries and capacity rows. */
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A PTO / time-off range for a person — reduces their capacity for the days it covers (see `lib/analytics/capacity.ts`). Both dates are inclusive, start-of-day epoch ms. */
export interface PersonTimeOff {
  id: string;
  personId: string;
  startDate: number;
  endDate: number;
  /** Free text, e.g. "Vacation", "Sick" — not a fixed enum. */
  label: string;
  createdAt: number;
}

export type TimeEntrySource = "timer" | "manual";

/**
 * One logged block of time against a task, either stopped from the built-in timer or entered
 * manually. `projectId` is denormalized from the task at entry time — tasks never move between
 * projects after creation in this app, so this is safe and saves a join on every budget/timesheet
 * query. `billable` is independent of cost accounting: actual cost (budget.ts) sums *all* logged
 * time regardless of this flag — billable exists for client-invoicing filtering, not to decide
 * what counts as real cost.
 */
export interface TimeEntry {
  id: string;
  taskId: string;
  projectId: string;
  personId: string;
  /** The day this entry is logged against (start-of-day epoch ms) — may differ from `createdAt` for a manually backdated entry. */
  date: number;
  minutes: number;
  billable: boolean;
  note: string;
  source: TimeEntrySource;
  createdAt: number;
  updatedAt: number;
}

/**
 * At most one row ever exists, always keyed `"current"` — a single global running timer, matching
 * the app's no-auth/single-user model (the same reason `Task.assignee` is a free string rather
 * than a session-scoped owner). `startedAt` is the persisted source of truth for elapsed time, not
 * a client-side counter, so a page reload never loses or resets a running timer — see README's
 * "Time tracking" section.
 */
export interface ActiveTimer {
  id: "current";
  taskId: string;
  projectId: string;
  personId: string;
  billable: boolean;
  note: string;
  startedAt: number;
}

/** Suggested defaults surfaced in the UI; the field itself stays free text. */
export const PROJECT_STATUS_SUGGESTIONS = [
  "Planning",
  "Active",
  "On Hold",
  "Completed",
  "Archived",
] as const;

export const DEFAULT_TASK_STATUSES = ["To Do", "In Progress", "Done"] as const;

export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

/**
 * ---------------------------------------------------------------------------
 * Database
 * ---------------------------------------------------------------------------
 * Schema versioning starts at version(1) deliberately: every later phase
 * (Board/Gantt/Calendar/Timeline, analytics, resource tracking, automation,
 * collaboration, templates) adds or reshapes tables, and each of those
 * changes should land as a new `db.version(N).stores({...})` call with an
 * `.upgrade()` migration where data needs transforming — never a hand edit
 * of version 1. See README.md for the migration workflow.
 */
class ProjectTrackerDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  taskStatuses!: EntityTable<TaskStatus, "id">;
  tasks!: EntityTable<Task, "id">;
  subtasks!: EntityTable<Subtask, "id">;
  customFieldDefs!: EntityTable<CustomFieldDef, "id">;
  customFieldValues!: EntityTable<CustomFieldValue, "id">;
  attachments!: EntityTable<Attachment, "id">;
  taskDependencies!: EntityTable<TaskDependency, "id">;
  recurrenceRules!: EntityTable<RecurrenceRule, "id">;
  milestones!: EntityTable<Milestone, "id">;
  savedReportViews!: EntityTable<SavedReportView, "id">;
  people!: EntityTable<Person, "id">;
  personTimeOff!: EntityTable<PersonTimeOff, "id">;
  timeEntries!: EntityTable<TimeEntry, "id">;
  activeTimers!: EntityTable<ActiveTimer, "id">;

  constructor() {
    super("project-tracker");

    this.version(1).stores({
      projects: "id, status, health, createdAt, updatedAt",
      taskStatuses: "id, projectId, order",
      tasks:
        "id, projectId, statusId, priority, dueDate, startDate, createdAt, completedAt, milestoneId, *tags",
      subtasks: "id, taskId, order",
      customFieldDefs: "id, projectId",
      customFieldValues: "id, taskId, fieldId, [taskId+fieldId]",
      attachments: "id, taskId, createdAt",
      taskDependencies: "id, taskId, dependsOnTaskId",
      recurrenceRules: "id, &taskId",
      milestones: "id, projectId, targetDate",
    });

    // v2 (Phase 2): recurring-task generation needs to find a template task's already-generated
    // instances, so `tasks` gains an indexed self-FK. Existing rows predate the field entirely
    // (IndexedDB has no column default), so the upgrade backfills it to null explicitly rather
    // than leaving it `undefined` — see README's Dexie schema section for why this is a new
    // version instead of an edit to version 1.
    this.version(2)
      .stores({
        tasks:
          "id, projectId, statusId, priority, dueDate, startDate, createdAt, completedAt, milestoneId, recurrenceParentId, *tags",
      })
      .upgrade(async (tx) => {
        await tx
          .table("tasks")
          .toCollection()
          .modify((task) => {
            if (task.recurrenceParentId === undefined) task.recurrenceParentId = null;
          });
      });

    // v3 (Phase 3): the report builder's saved views. A brand-new table needs no .upgrade() —
    // existing rows in every other table are untouched, and there's nothing to backfill.
    this.version(3).stores({
      savedReportViews: "id, name, updatedAt",
    });

    // v4 (Phase 4): workload/capacity, time tracking, and budget tracking. Four brand-new tables
    // need no backfill, but `tasks` and `projects` each gain a plain (non-indexed) field —
    // `estimatedHours` and `budgetEstimate` — that existing rows predate entirely, so both are
    // redeclared here (their index strings are unchanged from v2/v1) purely to make the upgrade
    // obvious and self-documenting; a Dexie versionchange transaction has access to every table in
    // the database regardless of which ones a given version's .stores() call lists, the same as
    // any other IndexedDB upgrade transaction.
    this.version(4)
      .stores({
        tasks:
          "id, projectId, statusId, priority, dueDate, startDate, createdAt, completedAt, milestoneId, recurrenceParentId, *tags",
        projects: "id, status, health, createdAt, updatedAt",
        people: "id, name, active",
        personTimeOff: "id, personId, startDate, endDate",
        timeEntries: "id, taskId, projectId, personId, date, billable",
        activeTimers: "id, taskId, personId",
      })
      .upgrade(async (tx) => {
        await tx
          .table("tasks")
          .toCollection()
          .modify((task) => {
            if (task.estimatedHours === undefined) task.estimatedHours = null;
          });
        await tx
          .table("projects")
          .toCollection()
          .modify((project) => {
            if (project.budgetEstimate === undefined) project.budgetEstimate = null;
          });
      });
  }
}

export const db = new ProjectTrackerDB();
