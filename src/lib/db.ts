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
  /**
   * Optional real-world "when does this project start" date (start-of-day epoch ms), or null.
   * Added in schema v7 (Phase 7) as the anchor a project template's relative task-date offsets are
   * computed against — deliberately separate from `createdAt`, which is just this row's insertion
   * timestamp and stops meaning "project start" the moment a project is planned ahead of when it's
   * entered into the app. Falls back to `createdAt` wherever an anchor is needed and this is unset
   * (see `lib/queries/templates.ts`).
   */
  startDate: number | null;
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
  /**
   * Added in Phase 5 for the `/ask` natural-language query feature — the report builder itself
   * never sets this (its UI has no control for it), so every pre-existing `SavedReportView` row
   * simply has this field `undefined`, which `applyReportFilters` treats identically to `null`
   * ("no constraint"). No Dexie migration needed: `ReportFilters` lives inside a JSON blob field on
   * `savedReportViews`, not as its own indexed column — see AGENTS.md.
   */
  completed?: boolean | null;
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

// ---------------------------------------------------------------------------
// Automation (Phase 5) — trigger + optional condition + action(s), project-scoped.
// ---------------------------------------------------------------------------

export type AutomationTriggerType = "statusChanged" | "taskOverdue" | "taskCreated";

/**
 * `statusId` is only meaningful (and required by the rule form) when `type === "statusChanged"` —
 * the specific status within the rule's own project the task must move *to* for the rule to fire.
 * Referencing the status by id (not name) matches how `Task.statusId` itself works. If that status
 * is later deleted, the rule simply never matches again — the same "dangle harmlessly" treatment
 * `deleteMilestone`/`deletePerson` give a stale reference elsewhere in this app, not a hard error.
 */
export interface AutomationTrigger {
  type: AutomationTriggerType;
  statusId?: string;
}

export type AutomationConditionField = "priority" | "tag" | "assignee";

/** A single extra guard evaluated against the task in addition to the trigger match — kept to one field/one value deliberately (see AGENTS.md) rather than a general condition builder. */
export interface AutomationCondition {
  field: AutomationConditionField;
  value: string;
}

export type AutomationActionType = "changeStatus" | "changePriority" | "addTag" | "setAssignee" | "setCustomField" | "notify";

/**
 * Only the fields relevant to `type` are populated. `notify` is the "log-only" action for when a
 * rule's real intent is alerting someone — it writes an `AutomationRunLogEntry` and shows a toast,
 * same as every other action's firing, no different delivery path of its own. Phase 6's
 * notification center reads every firing from that same log (not just `notify`-typed ones) rather
 * than treating `notify` as a special case — see AGENTS.md.
 */
export interface AutomationAction {
  type: AutomationActionType;
  statusId?: string;
  priority?: TaskPriority;
  tag?: string;
  assignee?: string;
  customFieldId?: string;
  customFieldValue?: string;
  message?: string;
}

export interface AutomationRule {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  condition: AutomationCondition | null;
  actions: AutomationAction[];
  createdAt: number;
  updatedAt: number;
}

/**
 * One row per rule *firing* (not per action — every action a firing applies is folded into one
 * `summary` string), written by `src/lib/queries/automations.ts`. `ruleName`/`taskTitle` are
 * denormalized on purpose: this log is a historical record and stays readable even after the rule
 * or task it refers to is later deleted/renamed (see AGENTS.md's cascade-delete note for why task
 * deletion deliberately does NOT clear these rows). This is also the shape Phase 6's notification
 * center and activity feed both read from directly (`lib/analytics/notifications.ts`,
 * `lib/analytics/activity.ts`) rather than duplicating automation-event detection — keep it simple
 * and stable, don't grow it ad hoc.
 */
export interface AutomationRunLogEntry {
  id: string;
  ruleId: string;
  ruleName: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
  trigger: AutomationTriggerType;
  summary: string;
  firedAt: number;
}

// ---------------------------------------------------------------------------
// AI provider config (Phase 5) — one pluggable client, three provider shapes.
// ---------------------------------------------------------------------------

export type AiProviderKind = "lmstudio" | "openai" | "azure";

/**
 * A singleton row (`id: "current"`, same pattern as `ActiveTimer`). Every provider's fields are
 * kept nested under its own key rather than one flat field set, so switching `provider` in the
 * settings UI never loses what was already typed into the other two — see AGENTS.md for the exact
 * request shape each provider needs and why Azure can't share OpenAI's code path.
 */
export interface AiProviderConfig {
  id: "current";
  provider: AiProviderKind;
  lmstudio: { baseUrl: string; model: string };
  openai: { apiKey: string; model: string };
  azure: { endpoint: string; deployment: string; apiVersion: string; apiKey: string };
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Comments (Phase 6) — per-task and per-project threads.
// ---------------------------------------------------------------------------

export type CommentEntityType = "task" | "project";

/**
 * `author` is free text, matching `Task.assignee`'s existing no-auth pattern (see AGENTS.md) —
 * there's no session/login in this app, so "who posted this" is just whatever the composer typed,
 * the same trade-off the whole app already makes for "who's this assigned to". `projectId` is
 * denormalized (the task's own `projectId`, or equal to `entityId` for a project-level comment) so
 * a project's combined activity feed can query every comment under it — its own thread plus every
 * task's — with one indexed lookup, the same trick `TimeEntry.projectId` already uses. `entityTitle`
 * is frozen at post time (the task/project's title/name then), mirroring `AutomationRunLogEntry`'s
 * own denormalized `taskTitle` — it's what lets a project-wide feed label "commented on <title>"
 * without a live join, and keeps reading after the task itself is renamed or deleted.
 */
export interface Comment {
  id: string;
  entityType: CommentEntityType;
  entityId: string;
  projectId: string;
  entityTitle: string;
  author: string;
  body: string;
  createdAt: number;
  /** Set the moment the comment is edited; null if it's never been touched since posting. */
  editedAt: number | null;
}

// ---------------------------------------------------------------------------
// Field-change log (Phase 6) — the audit-log half of the activity feed.
// ---------------------------------------------------------------------------

export type FieldChangeEntityType = "task" | "project";

/**
 * Exactly the fields this app tracks — see AGENTS.md for the full rationale. Deliberately not
 * every field on `Task`/`Project` (e.g. `description`/`tags` aren't tracked): these are the ones
 * meaningful enough to read back as history, mirroring how the automation engine's own condition
 * fields (`priority`/`tag`/`assignee`) are a deliberately narrow set rather than "everything".
 */
export type TrackedTaskField = "title" | "statusId" | "priority" | "assignee" | "startDate" | "dueDate" | "completedAt";
export type TrackedProjectField = "name" | "status" | "health";

/**
 * One row per tracked field edit, written by `recordTaskFieldChanges`/`recordProjectFieldChanges`
 * (`src/lib/queries/activity.ts`) from inside `updateTask`/`updateProject` — never from automation
 * actions, which bypass those functions entirely and log to `automationRunLog` instead (see
 * AGENTS.md's automation section for why actions never go through `updateTask`). This is what
 * keeps a single field edit from appearing twice in the activity feed once as "status changed" and
 * once as "rule X ran".
 *
 * `fromValue`/`toValue` are already-resolved **display strings** (a status's `name`, not its raw
 * `statusId`; a formatted date, not an epoch number) computed at write time, not the raw stored
 * value — the same "freeze a readable string, not a live reference" choice `AutomationRunLogEntry.
 * summary` already makes, so a later status rename/delete never makes old history unreadable.
 */
export interface FieldChangeLogEntry {
  id: string;
  entityType: FieldChangeEntityType;
  entityId: string;
  /** The task's own `projectId`, or equal to `entityId` for a project-entity row — see `Comment.projectId`. */
  projectId: string;
  entityTitle: string;
  field: TrackedTaskField | TrackedProjectField;
  fromValue: string | null;
  toValue: string | null;
  changedAt: number;
}

// ---------------------------------------------------------------------------
// Notification read-state (Phase 6).
// ---------------------------------------------------------------------------

/**
 * Notifications themselves are never stored — like the Phase 5 risk register, they're computed
 * live on every render from real data (overdue/due-soon tasks, `automationRunLog`,
 * `computeRiskRegister`; see `lib/analytics/notifications.ts`), so a resolved task or a fixed risk
 * simply stops producing one, with nothing to clean up. This table exists only to remember which
 * of those *computed* notifications a user has already read, keyed by the same deterministic id
 * the computation assigns each one (e.g. `deadline:{taskId}`, `automation:{runLogId}`,
 * `risk:{riskId}`) — the read-state mirror of `automationRunLog`'s own `[ruleId+taskId]` dedupe
 * ledger, just tracking "seen" instead of "already fired". A row is written lazily, only once a
 * notification is actually marked read, so an empty table correctly means "everything's unread".
 */
export interface NotificationReadState {
  id: string;
  /**
   * Set only for task-scoped (deadline) notifications, so `deleteTask` can clean these up the same
   * way it cascades every other task-owned row. Left `null` for automation/risk notifications —
   * their source rows follow `automationRunLog`'s/the risk register's own deletion rules instead
   * (see AGENTS.md), and a stray leftover boolean row for one of those is the same negligible,
   * accepted bloat `deleteTask` already tolerates for `automationRunLog`.
   */
  taskId: string | null;
  read: boolean;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Saved searches (Phase 6) — same pattern as `SavedReportView` (Phase 3), applied to global search.
// ---------------------------------------------------------------------------

export type SearchEntityType = "task" | "project" | "comment";

/** `entityTypes: []` means "search everything", matching `ReportFilters`' own "null/empty = no constraint" convention. */
export interface SavedSearchQuery {
  text: string;
  entityTypes: SearchEntityType[];
}

/** A named global-search filter set, persisted verbatim (not a result snapshot) — re-running it re-searches live data, exactly like `SavedReportView`. */
export interface SavedSearch {
  id: string;
  name: string;
  query: SavedSearchQuery;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Project templates (Phase 7) — a reusable snapshot of one project's shape.
// ---------------------------------------------------------------------------

/** A snapshot of one status row — no id; materialized fresh (with a brand-new id) on every "create from template". */
export interface TemplateTaskStatus {
  name: string;
  order: number;
  isDefault: boolean;
}

/**
 * A snapshot of one *project-scoped* custom field def. Global (`projectId: null`) defs aren't
 * snapshotted here — they already apply to every project automatically, template or not; only a
 * template task's *value* in a global field needs to travel with the template (see
 * `TemplateTask.customFieldValues`).
 */
export interface TemplateCustomFieldDef {
  name: string;
  type: CustomFieldType;
  options: string[] | null;
  order: number;
}

/**
 * One template task. Dates are stored as **day offsets from the source project's own start**
 * (`startDate ?? createdAt`), never absolute timestamps, so materializing the same template into
 * two different projects correctly produces two different sets of dates — e.g. "due 3 days after
 * project start" — anchored to each new project's own `startDate`, never the original's. See
 * README's Phase 7 section for the full worked example. `customFieldValues` is keyed by field
 * **name**, not `fieldId` — a materialized project's custom field defs get fresh ids, and global
 * fields are resolved by name against whatever already exists in the live database at materialize
 * time — the same exact-name-match join `Task.assignee` already uses against `Person`.
 */
export interface TemplateTask {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  /** Resolved against this template's own `statuses` list by name (see `ProjectTemplate.statuses`). */
  statusName: string;
  assignee: string;
  tags: string[];
  estimatedHours: number | null;
  startOffsetDays: number | null;
  dueOffsetDays: number | null;
  customFieldValues: Record<string, string>;
}

/**
 * A reusable project shape, saved from an existing project via `saveProjectAsTemplate`
 * (`src/lib/queries/templates.ts`) and materialized into a brand-new project — with fresh ids
 * throughout and every date recomputed from the new project's own start date — via
 * `createProjectFromTemplate`. `sourceProjectId` is purely informational (shown as "based on
 * <project>" in the UI): a template is a fully-baked snapshot, not a live reference, so deleting the
 * source project afterward leaves every template made from it untouched — the same "snapshot
 * survives its source" choice this app already makes for `AutomationRunLogEntry`/`Comment`
 * denormalization. Deliberately does **not** capture task dependencies, subtasks, milestones, or
 * recurrence rules — see AGENTS.md for the scope rationale; extend `TemplateTask` if a future need
 * justifies more.
 */
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  sourceProjectId: string | null;
  statuses: TemplateTaskStatus[];
  customFieldDefs: TemplateCustomFieldDef[];
  tasks: TemplateTask[];
  createdAt: number;
  updatedAt: number;
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
  automationRules!: EntityTable<AutomationRule, "id">;
  automationRunLog!: EntityTable<AutomationRunLogEntry, "id">;
  aiProviderConfig!: EntityTable<AiProviderConfig, "id">;
  comments!: EntityTable<Comment, "id">;
  fieldChangeLog!: EntityTable<FieldChangeLogEntry, "id">;
  notificationReadState!: EntityTable<NotificationReadState, "id">;
  savedSearches!: EntityTable<SavedSearch, "id">;
  projectTemplates!: EntityTable<ProjectTemplate, "id">;

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

    // v5 (Phase 5): automation rules + their run log, and the AI provider config. All three are
    // brand-new tables — like v3's savedReportViews, no .upgrade() is needed since nothing on an
    // existing table is changing shape. [ruleId+taskId] lets the overdue sweep cheaply ask "has
    // this rule already fired for this task" without a full table scan (see automations.ts).
    this.version(5).stores({
      automationRules: "id, projectId, enabled, updatedAt",
      automationRunLog: "id, ruleId, projectId, taskId, firedAt, [ruleId+taskId]",
      aiProviderConfig: "id",
    });

    // v6 (Phase 6): comments, the field-change audit log, notification read-state, and saved
    // searches. All four are brand-new tables — like v3/v5, no .upgrade() is needed. `entityId` is
    // indexed (not `[entityType+entityId]`) because every id in this app is already a globally
    // unique `crypto.randomUUID()` regardless of which table it names — the same reason
    // `taskDependencies` indexes plain `taskId` rather than a type-qualified compound key.
    // `projectId` is indexed on both `comments` and `fieldChangeLog` so a project's *combined*
    // activity feed (its own rows plus every one of its tasks' rows) is one indexed query, not a
    // per-task fan-out — see AGENTS.md.
    this.version(6).stores({
      comments: "id, entityId, projectId, createdAt",
      fieldChangeLog: "id, entityId, projectId, changedAt",
      notificationReadState: "id, taskId",
      savedSearches: "id, name, updatedAt",
    });

    // v7 (Phase 7): project templates, plus `Project.startDate` — the anchor a template's relative
    // task-date offsets are computed against. `projects` is redeclared here (its index string is
    // unchanged from v4/v1) purely to backfill the new plain field, the same pattern v4 already used
    // for `budgetEstimate`/`estimatedHours` — see README's Dexie schema section. `projectTemplates`
    // is a brand-new table, so it needs no backfill of its own.
    this.version(7)
      .stores({
        projects: "id, status, health, createdAt, updatedAt",
        projectTemplates: "id, name, updatedAt",
      })
      .upgrade(async (tx) => {
        await tx
          .table("projects")
          .toCollection()
          .modify((project) => {
            if (project.startDate === undefined) project.startDate = null;
          });
      });
  }
}

export const db = new ProjectTrackerDB();
