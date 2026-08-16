# Project Tracker

A full-featured personal project, task, and portfolio tracker with a
beautiful, data-rich analytics dashboard. Local-first (no backend server) —
all data lives in the browser via IndexedDB.

Build plan and phase status are tracked in the parent firstmate home's
backlog (not in this repo).

This repo currently implements **Phase 1 (foundation)**, **Phase 2
(views)**, **Phase 3 (analytics)**, and **Phase 4 (resource/time/budget
tracking)**: app shell, data layer, project/task CRUD, the List/Table view,
Kanban board, Gantt chart with critical-path analysis, Calendar, the
portfolio Timeline, recurring-task instance generation, the executive
dashboard (KPIs, burndown/burnup, portfolio rollup, resource heatmap, trend
charts, a click-to-filter drill-down, and a report builder with
CSV/PDF/Excel export), a workload/capacity view, a built-in timer plus
manual time entry with timesheets, and estimated-vs-actual budget tracking
per project/task. The dashboard's "Budget burn rate" KPI now computes a
real value from that budget data (see Phase 4 section below) — the honest
"not enough data yet" state Phase 3 shipped it with only shows again if no
project has a budget estimate set yet. Automation, collaboration, and
templates/import-export/RBAC are later phases.

## Running locally

```bash
npm install
npm run dev      # starts Vite on http://localhost:5173 (or next free port)
npm run build    # type-checks (tsc -b) and produces a production build in dist/
npm run lint     # oxlint
npm run preview  # serve the production build locally
```

No environment variables, backend, or account are needed — everything
persists in the browser's IndexedDB (database name `project-tracker`). To
reset all data during development, clear site data for the origin (DevTools
→ Application → IndexedDB → delete `project-tracker`) rather than editing
the schema.

## Tech stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui (Radix primitives, `radix-vega` style,
  Phosphor icons — see `components.json`)
- Dexie.js over IndexedDB for all persistence
- react-router for navigation
- Self-hosted variable fonts: Manrope (UI text) and JetBrains Mono (dates,
  counts, identifiers) via `@fontsource-variable/*`
- Recharts (Phase 3) for every chart on the dashboard, lazy-loaded
  (`React.lazy`) behind the `/dashboard` route — it's the single heaviest
  dependency in the app, so no other route pays for it.
- Report-builder export (Phase 3, all client-side, no backend): `jspdf` +
  `jspdf-autotable` for PDF, `write-excel-file` for `.xlsx`. CSV is
  hand-rolled (`src/lib/analytics/report.ts`) — trivial enough not to need a
  dependency. `write-excel-file` was chosen over the more common
  `xlsx`/SheetJS package specifically because the npm `xlsx` registry
  version carries two unpatched advisories (prototype pollution, ReDoS);
  `write-excel-file` is a small write-only library with zero advisories —
  see AGENTS.md.

## Design system

Defined once in `src/index.css` as CSS variables (light + dark, both
required — see `.dark` block) and consumed through shadcn's `@theme inline`
token layer, so every component reads `bg-background`, `text-primary`, etc.
rather than hardcoded colors:

- **Palette**: cool neutral (zinc-family) base + one accent (a considered
  teal, not the default AI-purple/blue). Health status (Red/Amber/Green) is
  a *separate* semantic ramp (`--health-*-bg` / `--health-*-fg` tokens),
  used only for project health badges — kept independent of the brand
  accent so the two never compete.
- **Shape**: one radius scale, derived from `--radius` in `:root`.
- **Icons**: Phosphor only (`iconLibrary: "phosphor"` in `components.json`
  — `npx shadcn add <component>` will keep generating Phosphor imports).
- **Motion**: CSS transitions only, `prefers-reduced-motion` respected
  globally (see the `@layer utilities` block in `index.css`). No JS
  animation library is installed; this app is a dense productivity tool,
  not a marketing site, so keep it that way unless a future phase has a
  concrete need (e.g. Gantt drag interactions).

**Important — do not drop `@import "shadcn/tailwind.css";` from
`index.css`.** It's not optional boilerplate: it defines the `data-active`,
`data-open`, `data-closed`, `data-checked`, `data-horizontal`, etc. custom
Tailwind variants that every generated `src/components/ui/*` component
relies on (Tabs, Dialog, Sheet, Checkbox, Select, ...). Without it those
components still render, but conditional styling silently no-ops — e.g.
`Tabs` loses `flex-col` layout and its content renders squeezed off-screen.
This is easy to lose when hand-editing global CSS; if you rewrite
`index.css`, keep this import.

Also avoid shadcn's `ScrollArea` inside a `flex`/`Tabs` layout — Radix's
`Viewport` uses table-style sizing internally that fights `flex-1` children
and can push content out of the layout entirely. A plain
`<div className="overflow-y-auto">` with an explicit height is more
predictable and is what `TaskDetailSheet` uses.

## Views (Phase 2)

### Kanban board — `/projects/:id/board`

Columns are that project's own `taskStatuses` rows (Phase 1's column
model) read live, so adding/renaming/reordering statuses in "Manage
columns" (a reused `StatusManager`) updates the board immediately. Cards
sort within a column by priority, then due date, then title — there's no
separate manual "board order" field.

Dragging uses the native HTML5 drag-and-drop API, not a library. It was
deliberately *not* the obvious choice: native HTML5 DnD has no reliable
touch-event equivalent, so every card also carries a plain `StatusSelect`
as a first-class way to change columns — this is what makes the board
usable at mobile width and with a keyboard, not a workaround bolted on
after the fact. See `AGENTS.md`'s sharp edges for when a real DnD library
would be justified instead.

### Gantt chart — `/projects/:id/gantt`

Bars are positioned from each task's own `startDate`/`dueDate`
(`src/lib/gantt/timeline-scale.ts`), grouped by status. Tasks with only one
date render as a small diamond marker instead of a bar; tasks with neither
date are listed separately under "Unscheduled" rather than being dropped
or crashing the layout.

**Critical path** (`src/lib/gantt/critical-path.ts`) is a real textbook CPM
forward/backward pass — not "any task with a dependency is critical." Nodes
are tasks weighted by duration (`dueDate - startDate` in days), edges are
dependency precedence normalized from `taskDependencies` via
`src/lib/dependency-graph.ts`. It computes earliest/latest start and finish
per task the way CPM would *schedule* the project from durations and
precedence alone, then float (`latestStart - earliestStart`) determines
which tasks — and which "tight" edges between them — are actually on the
critical path. This is intentionally independent of whether the calendar
dates the user picked happen to respect the dependency order; the
calendar dates only decide bar *position*.

Generated recurring task instances are excluded from the Gantt (and
Timeline) view — see "Recurring task generation" below.

### Calendar — `/calendar` (global) and `/projects/:id/calendar`

Both routes render the same `MonthCalendar`, scoped differently. Tasks
appear as a solid pill on their due date and, when the start date falls on
a different day, an additional outlined pill on the start date. Clicking a
task opens its detail panel directly; clicking a day with more than one
task opens a small popover listing all of that day's tasks.

### Timeline — `/timeline`

Portfolio-level: one horizontal band per project, positioned by the
min/max of its own tasks' dates and milestone dates, on one shared time
axis (reusing `timeline-scale.ts`). Each band shows the project's
`HealthBadge`; milestones render as flag markers on the band. Projects
with no dated tasks or milestones fall to an "No dates yet" list instead
of collapsing the shared axis.

## Analytics dashboard — `/dashboard` (Phase 3)

Everything on the dashboard is computed live from `tasks`/`projects` on
every render (via `useLiveQuery`) — there is no separate analytics/rollup
table, and every number recomputes itself the moment underlying task data
changes. Pure computation lives in `src/lib/analytics/` (no React), UI in
`src/components/dashboard/`, all orchestrated by `src/pages/DashboardPage.tsx`.

- **KPI cards** (`lib/analytics/kpis.ts`): completion rate, on-time
  delivery %, overdue count, and a team-velocity proxy are computed from
  `Task.createdAt/completedAt/dueDate` alone, each with a 30-day-trailing
  delta. Budget burn rate has no data to compute yet (no Phase 4/5 budget
  table) and always reports its honest "not enough data yet" state via the
  same `KpiResult` shape — real data lighting it up later needs no UI
  rework, only a real implementation behind that shape. `KpiCard.tsx` treats
  `value: null` as the not-enough-data signal, never a fake number.
- **Burndown/burnup** (`lib/analytics/burndown.ts`): reconstructed entirely
  from each task's own dates — `scope(D)` = tasks created by day D,
  `completed(D)` = tasks done by day D, `remaining(D) = scope − completed`.
  The "ideal" line is a straight line from total scope to 0 at the latest
  due date. Deliberately has no dedicated history/snapshot table (see
  AGENTS.md for why, and when a future phase might actually need one).
- **Portfolio rollup** (`PortfolioRollup.tsx`): every project's
  `HealthBadge` + a completion-percentage bar, one screen, no per-project
  drill-in required to read fleet health.
- **Resource heatmap** (`lib/analytics/heatmap.ts`, `ResourceHeatmap.tsx`):
  assignee × week grid; a cell counts tasks that assignee was *actively
  carrying* that week (`createdAt` before week end, not completed before
  week start) — closer to a utilization signal than a raw activity count.
  Real color-intensity encoding via the sequential teal ramp (see
  `index.css`), not a relabeled bar chart. Uses the same frozen-header/
  frozen-column single-scroll-container pattern as Gantt/Timeline (see
  AGENTS.md's sharp edges) since it's exactly the same "dense grid" case.
- **Trend charts** (`lib/analytics/trends.ts`, `TrendCharts.tsx`):
  throughput (tasks completed per week) and cycle time (creation →
  completion, averaged per week), both trailing 12 weeks.
- **Drill-down**: clicking a KPI card, a heatmap cell, or a chart bar/point
  doesn't just look clickable — it sets `DashboardPage`'s `drillDown` state
  to the exact `Task[]` that number was computed from, and
  `DrillDownPanel.tsx` renders that subset through the *same* `TaskTable`
  every other view uses (no second table component). The "all projects /
  one project" scope selector at the top of the page filters the KPI row,
  trend charts, and heatmap together; Portfolio rollup and Burndown stay
  independent (portfolio is inherently cross-project, burndown already has
  its own per-project picker).
- **Report builder** (`ReportBuilder.tsx`): filters on project/status/
  priority/assignee/date-range, reusing the same predicate shape TaskTable's
  own filter bar uses (`lib/analytics/report.ts`). Saved views persist to
  the `savedReportViews` Dexie table (schema v3) as the filter object
  itself, not a result snapshot, so a saved view re-queries live data every
  time it's loaded. Export (CSV/PDF/Excel) always operates on exactly the
  currently-filtered task set.

## Workload, time tracking, and budget — Phase 4

### People and the assignee join — `src/lib/db.ts`'s `Person` table

`Task.assignee` stays free text, unchanged from Phase 1 — it is **not**
turned into a `personId` foreign key. A new first-class `people` table
(name, weekly capacity hours, hourly rate, active flag) exists purely to
carry capacity/rate data a plain string can't hold, and joins back to tasks
by **exact `name` match** against `assignee`. This was a deliberate choice
over adding an FK column to `Task`:

- No breaking migration on the app's most-edited field, and every existing
  `assignee` string keeps working the moment a matching `Person` is added.
- The trade-off: renaming a `Person` leaves already-assigned tasks pointing
  at the stale name until reassigned. The Workload page surfaces this
  explicitly (an "unmatched assignees" warning listing any `assignee`
  string with no matching person), never silently drops that workload.
- Task/project forms with an assignee field (`TaskDetailSheet`) offer
  people's names via a `<datalist>` (the same technique `ProjectFormDialog`
  already used for status suggestions) to steer users toward consistent
  naming without forcing it.
- **For Phase 5/6**: people are first-class records now (stable `id`,
  capacity, rate) — automation/collaboration features that need to address
  "a person" (assign a notification, grant a permission) have a real table
  to reference. Only the `Task` ↔ `Person` link itself stays name-based.

### Workload / capacity — `/workload`

One page, two tabs. **Capacity** is the "who's overloaded, who has room"
grid (`lib/analytics/capacity.ts`, `CapacityGrid.tsx`): person × week
(current week + next 3, always exactly 4 columns — `defaultWorkloadWindow`
floors to Monday *before* adding 4 weeks so the day-of-week `now` falls on
never shifts the bucket count to 5), each cell showing allocated vs
available hours, color-banded with the same health-status token ramp
`HealthBadge` uses (`utilizationBand`: room/near/over) — reused
deliberately so "over capacity" carries the same visual weight as a red
project, not a second, competing color language. **People** is
`PeopleManager` — add/edit/delete people and their PTO/time-off ranges
(`PersonTimeOffDialog`).

Only **open** (incomplete) tasks with an `estimatedHours` value count
toward allocation — completed tasks don't consume future capacity. A
task's hours are spread **proportionally across every calendar day** in its
`[startDate, dueDate]` range, not dumped on the due date, so a multi-week
task reads as steady load instead of a last-minute pile-up; a task with
only one date puts all its hours on that single day. Tasks with neither
date but real `estimatedHours` are real workload that can't be placed on
the grid — they're totaled separately per person ("Unscheduled") rather
than silently dropped, mirroring Gantt's own "Unscheduled" list.

PTO reduces capacity via a simple approximation: `weeklyCapacityHours / 5`
is treated as one weekday's worth, subtracted for every Mon–Fri day inside
a time-off range that falls in a given week. This assumes a 5-day work
week distribution — a documented simplification, not a full working-
calendar model (see AGENTS.md).

This is a different, complementary view from Phase 3's `ResourceHeatmap`
(assignee × week *activity* grid on the dashboard) — that view still exists
untouched; this one is *allocation vs capacity*, the point Phase 4 adds.

### Time tracking — `/timesheets`, plus the Time tab on every task

**Timer**: a single global running timer (`activeTimers` table, always at
most one row, keyed `"current"`) — this app has no multi-user auth, so one
concurrent timer app-wide matches the same assumption `Task.assignee`
already makes. Starting a new timer while one is already running
auto-stops and saves the previous one first (Toggl-style "switching tasks
stops the previous one"), never silently discarding it. **The row's
`startedAt` epoch-ms timestamp is the only persisted state** — elapsed time
is always `Date.now() - startedAt`, recomputed on every read, never stored
as a counter. This is what makes a running timer survive a page reload
correctly: there's no in-memory counter to lose. A slim sticky bar
(`RunningTimerBar`, mounted once in `AppShell`, visible on every route)
shows the running timer with a live tick and a Stop button so it's never
lost track of by navigating away from wherever it was started. Start a
timer for a specific task from that task's own **Time** tab
(`TaskTimePanel`); stop it from there or from the global bar.

**Manual entries** (`timeEntries` table): logged directly on a task's Time
tab, or from `/timesheets`' "Log time" dialog (project → task cascading
pickers, for when you're not already looking at the task). Every entry
carries a `billable` flag, a `date` (the day it's *for*, independent of
`createdAt`), and a `source` (`"timer"` or `"manual"`).

**Timesheets** (`/timesheets`): per-person, per-week view — pick a person
(or "Everyone"), page through weeks, see entries grouped by day with a
total/billable/cost summary for that window.

### Budget tracking

**Actual cost = logged time × the logging person's hourly rate, always**
(`lib/analytics/budget.ts`'s `actualCost`) — summed across every time entry
regardless of its `billable` flag. This was a deliberate choice: `billable`
is for client-invoicing filtering, not a cost-accounting filter — an
internal, non-billable hour is still real labor cost. Rate is **per-person**
(`Person.hourlyRate`), not per-task or per-project — chosen because a
person's rate is what's actually true in the real world (a contractor's
rate doesn't change based on which task they're doing), and it composes
directly with the same `people` table capacity planning already needs, with
no second rate field to keep in sync.

**Estimated cost** is never a stored field — it's always computed fresh:
`Task.estimatedHours × the assignee's resolved hourly rate` (null when the
assignee has no matching `Person`, so a rate change or reassignment updates
every estimate immediately, nothing goes stale). `Project.budgetEstimate`
is a separate, manually-entered top-down dollar figure (set on project
create/edit, or from the project's own **Budget** tab) — the number
"estimated vs actual" is actually measured against. The Budget tab also
shows a bottom-up sum of every task's estimated cost as a secondary,
clearly-labeled cross-check, not conflated with the top-down estimate.

Estimated-vs-actual is never just a number: `budgetStatus` (under/near/over
— the same three-band language as `utilizationBand`) drives a colored
progress bar and a "Remaining" vs "Over budget by" figure that flips to the
destructive color and swaps its label the moment actual cost passes the
estimate.

**Dashboard KPI**: "Budget burn rate" (`computeDashboardKpis` in
`lib/analytics/kpis.ts`) is `Σ actual cost / Σ budget estimate` across every
project that has a `budgetEstimate` set (projects without one are excluded
from both sides of the ratio, not treated as a 0 estimate — that would
either hide their real spend or divide by zero). It's the one KPI with no
trailing-30-day delta: cumulative spend-so-far only ever climbs as more
time gets logged, so an "up = bad" trend arrow would be a false signal, not
real information. `KpiResult.critical` (new field, `KpiCard.tsx`) renders
the number in the destructive color when burn exceeds 100% — the still-
honest "no budget data yet" empty state only shows if no project has an
estimate.

## Recurring task generation

`recurrenceRules` was schema-complete since Phase 1; Phase 2 adds the
generator (`src/lib/recurrence.ts`) and the field that links a generated
copy back to its template (`Task.recurrenceParentId`, schema v2 — see
below).

**Trigger mechanism (chosen deliberately):** generation runs (1) once on
app startup (`App.tsx`), (2) immediately inside `setRecurrence` whenever a
rule is created or edited (so toggling recurrence on shows a result without
waiting for a reload), and (3) again on Calendar/Gantt page mount as a
safety net for a session left open across the lookahead window. On-demand
generation scoped to "whichever view the user happens to open" was
rejected because it would make a task's future instances depend on which
pages the user visited; startup + safety-net keeps it independent of that.

**Bounded lookahead:** `RECURRENCE_LOOKAHEAD_DAYS = 60`. Instances are
never generated past `now + 60 days`, no matter how long the app has been
open — re-running generation is idempotent (occurrence *n* is always
computed as `anchorDate + rule.interval * n` steps from the template's own
date, never chained off the previous instance, so the same *n* always
produces the same date and that date is the dedupe key). Shrinking or
growing the constant only changes how far the *next* run reaches; it never
needs to backfill or truncate retroactively.

Deleting a template task (one with a rule) cascades to every instance it
generated, so instances can't outlive a deleted `recurrenceParentId` — see
`deleteTask` in `src/lib/queries/tasks.ts`.

## Dexie schema (version 4)

All tables live in `src/lib/db.ts`. Every future phase should add a new
`db.version(N).stores({...})` call (with an `.upgrade()` migration if data
needs transforming) rather than editing an existing version — see Dexie's
docs on
[schema versioning](https://dexie.org/docs/Tutorial/Design#database-versioning).
Version 2 (Phase 2) adds `Task.recurrenceParentId` — see "Recurring task
generation" above. Version 3 (Phase 3) adds `savedReportViews` — a
brand-new table, so no `.upgrade()` was needed. Version 4 (Phase 4) adds
four brand-new tables (`people`, `personTimeOff`, `timeEntries`,
`activeTimers`) plus two plain (non-indexed) fields on existing tables —
`Task.estimatedHours` and `Project.budgetEstimate` — both backfilled to
`null` for pre-existing rows via `.upgrade()`. Note for future phases: a
Dexie upgrade transaction has access to every table in the database, not
just the ones a given version's `.stores()` call lists — v4's `.upgrade()`
modifies `tasks`/`projects` rows even though their index strings are
unchanged from earlier versions; only the tables whose *indexes* change
need to appear in that version's `.stores()` object.

| Table | Notes |
|---|---|
| `projects` | `status` is free text with UI-suggested defaults, not an enum. `health` is `'green' \| 'amber' \| 'red'`. `budgetEstimate` (v4) is a manually-entered dollar figure, or `null`. |
| `taskStatuses` | Each **project** owns its own ordered workflow (seeded with To Do / In Progress / Done on project creation, fully editable). Tasks reference `statusId`, not a name — renaming a status never orphans data. **This table is the column model Phase 2's Kanban board should read directly** (`order` field included). |
| `tasks` | `statusId` FK into the *same project's* `taskStatuses`. `completedAt` is independent of `statusId` (the row checkbox toggles it) — useful for cycle-time/burndown analytics later without depending on workflow-column semantics. `recurrenceParentId` (v2) FKs to the template task a generated instance came from, or `null`. `estimatedHours` (v4) is effort hours, or `null` — the input every capacity/workload/budget computation is built on. |
| `subtasks` | Ordered checklist items per task. |
| `customFieldDefs` | `projectId: null` = global field (applies to every project); otherwise project-scoped. |
| `customFieldValues` | One row per `(taskId, fieldId)`, unique via the `[taskId+fieldId]` compound index. Value is always stored as a string and parsed per `CustomFieldDef.type` on read. |
| `attachments` | Blob stored directly in IndexedDB (`blob: Blob`), not the filesystem. |
| `taskDependencies` | `dependsOnTaskId` is **not** scoped to the same project as `taskId` — cross-project dependencies are supported by design. `addDependency` (`src/lib/queries/tasks.ts`) rejects self-dependencies and anything that would close a cycle across the *whole* graph, not just this task's own edges — the Gantt critical-path pass assumes an acyclic graph. |
| `recurrenceRules` | `&taskId` unique index — one rule per task. Generation lives in `src/lib/recurrence.ts` (see "Recurring task generation" above). `Task.isRecurring` mirrors whether a rule exists — only the template task, never a generated instance. |
| `milestones` | Per-project; tasks reference `milestoneId` optionally. Surfaced as read-only markers on Gantt and Timeline. |
| `savedReportViews` | The Phase 3 report builder's saved filter sets. Stores the `ReportFilters` object itself (project/status/priority/assignee/date-range), not a result snapshot — loading a saved view re-runs it against current live data. No foreign key into `projects`/`tasks`, so nothing to cascade-delete. |
| `people` (v4) | First-class person records — name, `weeklyCapacityHours`, `hourlyRate`, `active`. Joins to `Task.assignee` by exact name match, **not** an FK on `Task` — see "People and the assignee join" above. |
| `personTimeOff` (v4) | PTO/time-off ranges per person (`startDate`/`endDate` inclusive, a free-text `label`). Reduces that person's capacity on the Workload grid for the days it covers. |
| `timeEntries` (v4) | One logged block of time (`taskId`, `personId`, `date`, `minutes`, `billable`, `source: "timer" \| "manual"`). `projectId` is denormalized from the task at entry time — safe since tasks never change project after creation. |
| `activeTimers` (v4) | At most one row, always `id: "current"` — the single global running timer. `startedAt` is the only persisted state; elapsed time is always recomputed from it, never stored as a counter. |

Cascading deletes are hand-rolled (IndexedDB has no `ON DELETE CASCADE`) —
see `deleteProject` and `deleteTask` in `src/lib/queries/`. Deleting a
project walks every task through `deleteTask` (which itself cleans up that
task's subtasks/attachments/customFieldValues/dependencies/recurrence, and
now `timeEntries`/a matching `activeTimer` too) and then clears the
project's own statuses/fields/milestones, all inside Dexie transactions. If
you add a table with a foreign key into `projects` or `tasks`, wire its
cleanup into the matching delete function. `deletePerson`
(`src/lib/queries/people.ts`) is the one exception to "cascade everything":
it deletes the person's own `personTimeOff` rows and clears a matching
`activeTimer`, but deliberately leaves their `timeEntries` in place — a
logged hour stays a real historical fact even after the person record is
removed (the UI resolves a missing `personId` to "Deleted person" rather
than crashing), the same reasoning `deleteMilestone` already uses for tasks
that referenced a deleted milestone.

## Project structure

```
src/
  lib/
    db.ts                 Dexie schema + shared domain types
    ids.ts                 id/timestamp helpers
    recurrence.ts           Recurring-instance generator (bounded lookahead, idempotent)
    dependency-graph.ts     Pure dependency-DAG logic: normalize edges, cycle check, blocked-task check
    gantt/
      critical-path.ts        CPM forward/backward pass
      timeline-scale.ts       Shared date<->pixel math (Gantt + Timeline)
    analytics/               Pure computation, no React — one file per chart/feature
      date-buckets.ts           Day/week bucketing shared by burndown/trends/heatmap/capacity
      kpis.ts                   Executive KPI cards (completion/on-time/overdue/velocity/budget)
      burndown.ts                Ideal-vs-actual burndown/burnup curve, derived from task dates
      trends.ts                  Throughput + cycle-time time series
      heatmap.ts                  Assignee x week resource-*activity* grid (Phase 3 dashboard)
      report.ts                   Report-builder filter predicate + CSV/PDF/Excel export
      capacity.ts                 Phase 4: person x week allocated-vs-capacity workload grid
      budget.ts                   Phase 4: actual/estimated cost per task/project
    chart-theme.ts           Shared Recharts colors/styles (CSS-var-backed, theme-reactive)
    format.ts                Phase 4: shared hours/currency/duration formatting
    queries/                CRUD + cascade-delete functions, one file per entity
      report-views.ts          Saved report-view CRUD (Phase 3)
      people.ts                 Phase 4: people + PTO CRUD
      time-entries.ts            Phase 4: manual time entries + the global timer's start/stop
  hooks/                    useLiveQuery wrappers (reactive reads) + theme context
    use-people.ts              Phase 4
    use-time-entries.ts         Phase 4 (includes useActiveTimer)
  components/
    ui/                      shadcn-generated primitives (owned, customized — see index.css)
    layout/                   App shell: sidebar, mobile drawer, nav registry, theme toggle
    projects/                  Project card, create/edit dialog, health badge, project picker (Board/Gantt landing)
    tasks/                      Table, inline-edit cells, status/priority selects, task detail panel + its sub-panels
                                 (Phase 4: TaskTimePanel — the detail sheet's Time tab)
    milestones/                 Milestone manager
    board/                      Kanban board/column/card
    gantt/                      Gantt chart + SVG dependency-link overlay
    calendar/                   Month calendar grid
    timeline/                   Portfolio timeline bands
    dashboard/                  Phase 3: KpiCard, ChartCard, BurndownChart, PortfolioRollup,
                                 ResourceHeatmap, TrendCharts, DrillDownPanel, ReportBuilder
    people/                    Phase 4: PeopleManager, PersonFormDialog, PersonTimeOffDialog
    workload/                  Phase 4: CapacityGrid
    timer/                     Phase 4: RunningTimerBar (global), TimerStartControl (per-task)
    timesheets/                Phase 4: ManualTimeEntryDialog
    budget/                    Phase 4: ProjectBudgetPanel (the project detail page's Budget tab)
  pages/                     Route-level components (ProjectsPage, ProjectDetailPage, AllTasksPage,
                              BoardPage(+Picker), GanttPage(+Picker), CalendarPage, TimelinePage,
                              WorkloadPage, TimesheetsPage — Phase 4,
                              DashboardPage — lazy-loaded, see App.tsx)
```

## Known trade-offs (intentional, revisit if a later phase needs otherwise)

- Table pagination is simple page-based (25 rows/page), not virtualized —
  fine at personal-project scale; revisit if a phase needs thousands of
  rows in one table.
- No optimistic-UI layer — Dexie writes are fast enough locally that
  `useLiveQuery` re-render latency hasn't been an issue. Introduce one if
  a future phase adds slower operations (e.g. large imports).
- Gantt and Timeline rows are plain DOM (no virtualization), scoped inside
  their own `max-h-[70vh] overflow-auto` pane rather than the page scroll
  — fine at personal-project scale; revisit together with the table
  pagination trade-off above if row counts grow much larger.
- Generated recurring task instances are deliberately excluded from Gantt
  and Timeline (Calendar and Board still show them) — a daily rule alone
  can produce dozens of dated instances within the lookahead window, which
  would flood a schedule/critical-path view with rows that carry no real
  scheduling meaning. This is intentional scoping, not a filter bug.
- Burndown/burnup (Phase 3) has no dedicated daily-snapshot table — it
  reconstructs the curve from each task's own `createdAt`/`completedAt`/
  `dueDate` on every render. This is exact for "when was a task created and
  when was it finished" but can't reconstruct anything that isn't stored on
  the task itself (e.g. a task's *status* history, or scope that was added
  and later deleted before anyone looked at the dashboard). Revisit with a
  real snapshot table only if a future phase needs that finer fidelity —
  reconstruction-from-current-fields is deliberately preferred over adding
  new state to keep in sync.
- Capacity's PTO reduction (Phase 4, `lib/analytics/capacity.ts`) assumes a
  flat 5-day work week — `weeklyCapacityHours / 5` per Mon–Fri day inside a
  time-off range. It doesn't model a 4-day week, unusual schedules, or
  partial/half-day PTO; a person on a non-standard schedule just needs
  their `weeklyCapacityHours` set to what actually applies. Revisit with a
  real working-calendar model only if a future phase needs per-day
  granularity finer than this.
- Budget tracking (Phase 4) derives actual cost only from logged time ×
  person rate — there's no direct/non-time cost-entry table (e.g. software
  licenses, hardware, contractor invoices billed outside hours). The Phase
  4 brief explicitly allowed skipping this ("plus any direct cost entries
  you choose to support"); add one only if a future phase's budget picture
  genuinely needs non-labor costs.
