# Project Tracker

A full-featured personal project, task, and portfolio tracker with a
beautiful, data-rich analytics dashboard. Local-first (no backend server) —
all data lives in the browser via IndexedDB.

It includes: an app shell with project/task CRUD, the List/Table view, a
Kanban board, a Gantt chart with critical-path analysis, a Calendar, a
portfolio Timeline, recurring-task instance generation, an executive
dashboard (KPIs, burndown/burnup, portfolio rollup, resource heatmap, trend
charts, a click-to-filter drill-down, and a report builder with CSV/PDF/
Excel export), a workload/capacity view, a built-in timer plus manual time
entry with timesheets, estimated-vs-actual budget tracking per project/
task, project-scoped automation rules with a run log, a cross-project risk
register, AI features (a pluggable LM Studio/OpenAI/Azure OpenAI client,
per-project AI-generated status summaries, and a natural-language task
query page) behind a settings page at `/settings/ai`, per-task/per-project
comment threads, a unified activity feed/audit log, an in-app notification
center with deadline reminders and a digest, global search (Cmd/Ctrl+K)
with saved filters, reusable project templates with relative-date task
generation, JSON export/import (a project or the whole database) and CSV
export/import for tasks, and a roles/permissions data model laying the
groundwork for real access control. The dashboard's "Budget burn rate" KPI
computes a real value once at least one project has a budget estimate set
— it shows an honest "not enough data yet" state until then. **Real
multi-user auth/sync is not implemented** — the roles/permissions model is
scaffolding a future auth phase would enforce, not enforcement itself (see
"Roles & permissions" below); today's single local user is always the most
permissive role.

For how this app was built — development phases, schema version history,
project structure, and the engineering trade-offs behind it — see
[DEVELOPMENT.md](DEVELOPMENT.md).

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
- Recharts for every chart on the dashboard, lazy-loaded (`React.lazy`)
  behind the `/dashboard` route — it's the single heaviest dependency in
  the app, so no other route pays for it.
- Report-builder export (all client-side, no backend): `jspdf` +
  `jspdf-autotable` for PDF, `write-excel-file` for `.xlsx`. CSV is
  hand-rolled (`src/lib/analytics/report.ts`) — trivial enough not to need a
  dependency. `write-excel-file` was chosen over the more common
  `xlsx`/SheetJS package specifically because the npm `xlsx` registry
  version carries two unpatched advisories (prototype pollution, ReDoS);
  `write-excel-file` is a small write-only library with zero advisories —
  see AGENTS.md.
- AI features add **zero new dependencies** — `src/lib/ai/client.ts` talks
  to LM Studio/OpenAI/Azure OpenAI with plain `fetch` against their REST
  APIs directly, no provider SDK. No client-side LLM runtime either — every
  provider is a real HTTP endpoint.
- Global search adds **one dependency**: `cmdk`, via shadcn's
  `Command`/`CommandDialog` primitives — the Cmd/Ctrl+K palette. Comments,
  the activity feed, notifications, and saved searches are all plain
  Dexie + React, no extra packages.
- Templates, import/export, and RBAC scaffolding add **zero new
  dependencies** — JSON export/import is `JSON.stringify`/`JSON.parse` plus
  the same `triggerBlobDownload` helper CSV export already uses; CSV import
  is a small hand-rolled RFC 4180 parser (`src/lib/io/import.ts`), the same
  "simple enough not to need a package" call `report.ts`'s CSV export
  already made.

## Design system

Defined once in `src/index.css` as CSS variables (light + dark, both
required) and consumed through shadcn's `@theme inline` token layer, so
every component reads `bg-background`, `text-primary`, etc. rather than
hardcoded colors.

- **Palette**: cool neutral (zinc-family) base + one accent (a considered
  teal, not the default AI-purple/blue). Health status (Red/Amber/Green) is
  a *separate* semantic ramp (`--health-*-bg` / `--health-*-fg` tokens),
  used only for project health badges — kept independent of the brand
  accent so the two never compete.
- **Shape**: one radius scale, derived from `--radius` in `:root`.
- **Icons**: Phosphor only (`iconLibrary: "phosphor"` in `components.json`
  — `npx shadcn add <component>` will keep generating Phosphor imports).
- **Motion**: CSS transitions only, `prefers-reduced-motion` respected
  globally. No JS animation library is installed; this app is a dense
  productivity tool, not a marketing site, so keep it that way unless a
  concrete need arises (e.g. Gantt drag interactions).

Implementation gotchas around this design system (a required CSS import,
and a layout trap with shadcn's `ScrollArea`) are tracked in AGENTS.md's
sharp edges, not duplicated here.

## Views

### Kanban board — `/projects/:id/board`

Columns are that project's own `taskStatuses` rows (the column model) read
live, so adding/renaming/reordering statuses in "Manage columns" (a reused
`StatusManager`) updates the board immediately. Cards sort within a column
by priority, then due date, then title — there's no separate manual "board
order" field.

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

## Analytics dashboard — `/dashboard`

Everything on the dashboard is computed live from `tasks`/`projects` on
every render (via `useLiveQuery`) — there is no separate analytics/rollup
table, and every number recomputes itself the moment underlying task data
changes. Pure computation lives in `src/lib/analytics/` (no React), UI in
`src/components/dashboard/`, all orchestrated by `src/pages/DashboardPage.tsx`.

- **KPI cards** (`lib/analytics/kpis.ts`): completion rate, on-time
  delivery %, overdue count, and a team-velocity proxy are computed from
  `Task.createdAt/completedAt/dueDate` alone, each with a 30-day-trailing
  delta. Budget burn rate (`Σ actual cost / Σ budget estimate` across every
  project with a budget estimate set — see "Budget tracking" below) is the
  one KPI with no such delta, and always reports its honest "not enough
  data yet" state via the same `KpiResult` shape until at least one project
  has an estimate. `KpiCard.tsx` treats `value: null` as the not-enough-data
  signal, never a fake number.
- **Burndown/burnup** (`lib/analytics/burndown.ts`): reconstructed entirely
  from each task's own dates — `scope(D)` = tasks created by day D,
  `completed(D)` = tasks done by day D, `remaining(D) = scope − completed`.
  The "ideal" line is a straight line from total scope to 0 at the latest
  due date.
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

## Workload, time tracking, and budget

### People and the assignee join — `src/lib/db.ts`'s `Person` table

`Task.assignee` stays free text, unchanged from the app's original data
model — it is **not** turned into a `personId` foreign key. A first-class
`people` table (name, weekly capacity hours, hourly rate, active flag)
exists purely to carry capacity/rate data a plain string can't hold, and
joins back to tasks by **exact `name` match** against `assignee`. This was
a deliberate choice over adding an FK column to `Task`:

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
- People are first-class records (stable `id`, capacity, rate) —
  automation and collaboration features that need to address "a person"
  (assign a notification, grant a permission) have a real table to
  reference. Only the `Task` ↔ `Person` link itself stays name-based.

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

This is a different, complementary view from the dashboard's own
`ResourceHeatmap` (assignee × week *activity* grid, described above) —
that view still exists untouched; this one is *allocation vs capacity*
rather than raw activity.

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
real information. `KpiResult.critical` (`KpiCard.tsx`) renders the number
in the destructive color when burn exceeds 100% — the still-honest "no
budget data yet" empty state only shows if no project has an estimate.

## Recurring task generation

`recurrenceRules` was schema-complete from the start; the generator
(`src/lib/recurrence.ts`) and the field that links a generated copy back to
its template (`Task.recurrenceParentId`, schema v2 — see below) came
shortly after.

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

## Automation

Project settings' **Automations** section (a subsection alongside Task
statuses/Custom fields, not a separate page) lists, creates, and edits
project-scoped rules: a **trigger**, an optional **condition**, and one or
more **actions**.

- **Triggers**: task status changes to a specific status, a task becomes
  overdue, or a task is created.
- **Condition** (optional, at most one): priority equals / has tag / assignee
  equals a value — a single extra guard, not a general condition builder.
- **Actions**: change status, change priority, add a tag, set assignee, set
  a custom field's value, or **notify** — a log-only action for when a rule's
  real intent is alerting someone. `notify` writes one row to a lightweight
  **automation run log** (rule name, task affected, what happened, when)
  and shows a toast the moment it fires; the notification center (see
  below) also surfaces these firings by reading the same log. Every action
  a single rule firing applies is folded into that one log row and one
  toast, not one per action.

Rule mutations always go through real Dexie writes directly
(`db.tasks.update`), not through the same `updateTask()` that triggers
`statusChanged` automations — so an automation's own action never
re-triggers another rule evaluation. This is what keeps a misconfigured
pair of rules (A sets status to what triggers B, B sets it back to what
triggers A) from cascading forever; see AGENTS.md for the exact mechanism
and how it was stress-tested.

"Task becomes overdue" has no natural moment to fire at (nothing writes to
a task the instant its due date passes) — a sweep runs on app startup,
every 60 seconds while the app stays open, and immediately after saving a
rule with this trigger, deduping against the run log so an overdue task
that's stayed overdue for days doesn't refire the same rule repeatedly. See
`src/lib/queries/automations.ts` and AGENTS.md for the full mechanism.

## Risk register — `/risks`

One cross-project view surfacing every real at-risk item, sorted by
severity, with a click-through straight to the affected task (opens
`TaskDetailSheet`) or project. Three sources, computed live (no separate
risk table — same "recompute from real data on every render" philosophy as
the dashboard):

- **Overdue task dependencies** — an incomplete, overdue task still blocking
  another incomplete task, reusing the same dependency-edge normalization
  the Gantt critical-path pass builds on.
- **Budget overruns** — a project whose actual cost has passed, or is
  closing in on, its budget estimate.
- **Milestones** — approaching or missed target dates, combining
  user-set `"at-risk"`/`"missed"` status with two automatic derivations (a
  still-`"upcoming"` milestone whose date has already passed reads as an
  undetected miss; one inside a 7-day window is a heads-up before it's too
  late).

Each risk carries a severity (`high`/`medium`/`low`) and a project/task
link; filters for severity, risk type, and project narrow the list. See
`src/lib/analytics/risks.ts` and AGENTS.md for the exact severity rules and
why low severity deliberately isn't rendered in the "everything's fine"
green this app uses everywhere else.

## AI provider, summaries, and natural-language querying

A settings page at `/settings/ai` configures **one of three OpenAI-
compatible-ish providers** through a single pluggable client
(`src/lib/ai/client.ts`) — the summary feature and the `/ask` query feature
both call the exact same `chatCompletion()` rather than duplicating
per-provider request logic:

- **LM Studio** (local, the default) — base URL defaults to
  `http://localhost:1234/v1`, no API key, and a "Fetch available models"
  button lists whatever's actually loaded (`GET {baseUrl}/models`) instead
  of hardcoding a name.
- **OpenAI** — the standard `https://api.openai.com/v1`,
  `Authorization: Bearer <key>` header, user-supplied key + model name.
- **Azure OpenAI** — a genuinely different request shape, not just a
  different base URL: endpoint + deployment name + API version go into the
  URL itself (`{endpoint}/openai/deployments/{deployment}/chat/completions
  ?api-version=...`), auth is an `api-key` header (not a bearer token), and
  the request body has no `model` field at all — the deployment picks it.

Config persists to an `aiProviderConfig` Dexie table (plain-text API
key — this is a local-only single-user tool, not a hosted app, so no
encryption scheme), never to `localStorage`, and is never written to the
console anywhere in this codebase. **Test connection** makes one real
request and reports success or failure with the actual response/error, so
a bad config is never discovered later by a summary silently failing.
Every AI-dependent surface (the project Summary tab, `/ask`) shows a
calm "set up an AI provider first" empty state with a link to
`/settings/ai` when nothing's configured — never a silent no-op.

**Project summaries** — a **Summary** tab on the project detail page
(alongside Tasks/Milestones/Budget/Settings) sends that project's task
list, status breakdown, overdue items, and recent activity (last 14 days)
to the configured provider and shows the resulting status write-up. A
collapsed **"What was sent"** detail shows the exact prompt and data —
this is a local tool the person running it can and should be able to
inspect, not a black box.

**Natural-language querying** — `/ask` turns a plain-language question
("what's overdue this week?") into a real `ReportFilters` object (the same
type/shape the report builder already uses) and runs it through the
existing `applyReportFilters`, rendering the result through the same
`TaskTable` every other view uses. The model's only job is proposing a
filter; every field it returns is validated against the real, live set of
known projects/statuses/priorities before being trusted, so a hallucinated
status name (or any other bad value) is dropped to "no constraint" rather
than silently producing an empty or wrong result. See
`src/lib/ai/{client,summary,nl-query}.ts` and AGENTS.md for the full
request shapes and the validation approach.

## Comments, activity feed, notifications & search

### Comments — task detail sheet's **Comments** tab, project detail page's **Comments** tab

Per-task and per-project threads (`comments` table). `author` is free text,
matching `Task.assignee`'s existing no-auth pattern — the composer offers a
`<datalist>` of `people` names (same technique the assignee field already
uses) and remembers the last name typed in `localStorage`, purely as a
convenience, not an identity system. Comments support edit (sets `editedAt`)
and delete; both are always available on every comment since there's no
concept of "your own" comment without real auth.

### Activity feed / audit log — task detail sheet's **Activity** tab, project detail page's **Activity** tab

One merged, chronological feed per task or project, combining three
sources: **field changes** (a `fieldChangeLog` table — see AGENTS.md for
exactly which `Task`/`Project` fields are tracked and why automation
actions never appear here twice), **comments**, and **the automation run
log** (from Automation above, read directly, not re-detected). A project's
Activity tab already shows the combined view across every one of its tasks
too — see AGENTS.md for how that's made a single indexed query rather than
a per-task fan-out.

### Notification center — bell icon (sidebar footer on desktop, header on mobile)

Click the bell for a panel with two tabs: **Notifications** (deadline
reminders for overdue/due-soon tasks, automation firings, and risks — all
computed live, never stored, same philosophy as the risk register itself)
and **Digest** (Today / This week toggle, summarizing tasks created/
completed/due, comments posted, automations run, and current active-risk
count for that window — an in-app summary, not a sent email, since this
app has no backend to send one from). Unread state persists in a small
`notificationReadState` table; clicking a notification marks it read and
opens the task (or navigates to the project, for risk/automation
notifications with no single task). See AGENTS.md for the exact
notification-id scheme and digest period math.

### Global search — `Cmd/Ctrl+K` from anywhere

A command-palette search across projects, tasks, and comments
(`src/lib/search.ts`, plain substring matching), with type filter chips and
**saved searches** — name the current query/filter combination for
one-click reuse later, persisted the same way the report builder's own
saved views are (a `savedSearches` table storing the query itself, re-run
against live data on load, not a result snapshot).

## Project templates, import/export & RBAC scaffolding

### Project templates — a project's Settings tab, and "From template" on `/projects`

**Save as template** (Settings tab → **Data** section, on any project)
snapshots that project's task statuses, its own custom field defs, and
every real (non-generated-instance) task into a reusable `ProjectTemplate`
row. **Create a new project from a template** (`/projects` → "From
template", shown once at least one template exists) picks a template, a
name, and a **start date** for the new project, then materializes real
tasks with statuses/fields/dates recomputed for that project.

The key idea: a template task's dates are stored as **day offsets from the
source project's own start** (`startDate`, or `createdAt` when unset), not
as fixed calendar dates — "due 3 days after project start," not "due
September 4th." Materializing a template recomputes every task's actual
dates from the *new* project's own start date, so the same template
produces correctly shifted dates every time it's used, regardless of which
project's original dates it was captured from. Custom field values follow
the same "recompute at materialize time" philosophy: they're captured
keyed by field *name* (not id, since ids are regenerated fresh) and
resolved against whatever fields actually exist on the new project. A
template is a frozen snapshot, not a live reference — deleting the source
project afterward leaves every template made from it untouched.

Deliberately out of scope: task dependencies, subtasks, milestones, and
recurrence rules aren't captured by a template (a template task always
lands as a plain one-off task on the new project). See AGENTS.md for the
full mechanism and the exact scope rationale.

### Import & export — a project's Settings tab (Data section), and `/projects`

**Export**: a single project (Settings → Data → "Export project (JSON)")
or the whole database (`/projects` → "Export all") to one JSON file — task
statuses, custom field defs (project-scoped and global), milestones,
tasks, subtasks, custom field values, and task dependencies. A project's
own tasks can also be exported straight to CSV ("Export tasks (CSV)"),
reusing the exact same `buildExportRows`/`exportRowsAsCsv` functions the
report builder's own CSV export already uses — no separate export
pipeline.

**Import**: `/projects` → "Import" accepts a JSON file exported from this
app (either shape above) and always creates **brand-new project(s)** with
fresh ids — it never overwrites or merges into existing data, so
re-importing the same file twice just makes a second copy. A project's own
Settings tab also has "Import tasks (CSV)", which adds tasks to *that*
project from a CSV file with the same column set the exporter produces
(`Title` required; `Status`/`Priority`/`Assignee`/`Start date`/`Due
date`/`Tags` optional, matched by header name, not column position).

Every import validates the **entire** file before writing anything — a
malformed JSON file (unparseable, wrong shape, a task referencing a status
that isn't in the file) or a CSV with a bad row (missing title, an unknown
status name, an unparseable date) fails with a specific, readable error
and imports nothing at all, never a partial result. See AGENTS.md for the
exact validation rules, the JSON importer's id-remapping/transaction
details, and one known CSV round-trip asymmetry (a blank "Assignee" cell
round-trips as the literal text "Unassigned", inherited from how the
existing CSV exporter already displays an unassigned task).

### Roles & permissions (RBAC scaffolding)

This app still has **no real authentication, sessions, or multi-user
sync** — the roles/permissions model here builds the *shape* a future auth
phase would enforce, nothing more. `src/lib/permissions.ts` defines three
roles (**Owner**, **Editor**, **Viewer**) and a small, fixed set of
permissions (create/edit/delete a project, create/edit/delete a task,
manage automations, manage templates, run an import) via a pure
`hasPermission(role, permission)` function — Owner can do everything,
Editor can do everything except delete a project (the one no-undo action
in this app), Viewer can do nothing that mutates data. `useCurrentRole()`
always returns `"owner"` today (there being only one local user, who is
naturally the most permissive role) — it's the single seam a real
multi-user phase would replace with an actual session lookup, and nothing
else in the codebase would need to change.

A deliberately small, real set of actions already call `hasPermission()`
today — project delete, task delete, template save/apply, and running an
import — so the wiring is genuinely exercised end to end, even though
every one of those checks currently passes. Gating every create/edit
action across the whole app was considered and rejected: it would touch
dozens of existing files for zero behavior change today, without this app
having any way to actually enforce a different role yet. **To be direct
about what this scaffolding does and doesn't do**: nothing is actually
access-controlled — there's no login screen, no account switcher, and no
server to enforce anything even if there were.

## Data model

All tables live in `src/lib/db.ts` (currently schema version 7). New
fields or tables are added via a new `db.version(N).stores({...})` call
(with an `.upgrade()` migration if data needs transforming) rather than
editing an existing version — see
[DEVELOPMENT.md](DEVELOPMENT.md) for the full version-by-version history.

| Table | Notes |
|---|---|
| `projects` | `status` is free text with UI-suggested defaults, not an enum. `health` is `'green' \| 'amber' \| 'red'`. `budgetEstimate` is a manually-entered dollar figure, or `null`. `startDate` is an optional real-world "project start" date, or `null` — the anchor a template's relative task-date offsets are computed against (falls back to `createdAt` when unset). |
| `taskStatuses` | Each **project** owns its own ordered workflow (seeded with To Do / In Progress / Done on project creation, fully editable). Tasks reference `statusId`, not a name — renaming a status never orphans data. **This table is the column model the Kanban board reads directly** (`order` field included). |
| `tasks` | `statusId` FK into the *same project's* `taskStatuses`. `completedAt` is independent of `statusId` (the row checkbox toggles it) — useful for cycle-time/burndown analytics later without depending on workflow-column semantics. `recurrenceParentId` FKs to the template task a generated instance came from, or `null`. `estimatedHours` is effort hours, or `null` — the input every capacity/workload/budget computation is built on. |
| `subtasks` | Ordered checklist items per task. |
| `customFieldDefs` | `projectId: null` = global field (applies to every project); otherwise project-scoped. |
| `customFieldValues` | One row per `(taskId, fieldId)`, unique via the `[taskId+fieldId]` compound index. Value is always stored as a string and parsed per `CustomFieldDef.type` on read. |
| `attachments` | Blob stored directly in IndexedDB (`blob: Blob`), not the filesystem. |
| `taskDependencies` | `dependsOnTaskId` is **not** scoped to the same project as `taskId` — cross-project dependencies are supported by design. `addDependency` (`src/lib/queries/tasks.ts`) rejects self-dependencies and anything that would close a cycle across the *whole* graph, not just this task's own edges — the Gantt critical-path pass assumes an acyclic graph. |
| `recurrenceRules` | `&taskId` unique index — one rule per task. Generation lives in `src/lib/recurrence.ts` (see "Recurring task generation" above). `Task.isRecurring` mirrors whether a rule exists — only the template task, never a generated instance. |
| `milestones` | Per-project; tasks reference `milestoneId` optionally. Surfaced as read-only markers on Gantt and Timeline. |
| `savedReportViews` | The report builder's saved filter sets. Stores the `ReportFilters` object itself (project/status/priority/assignee/date-range), not a result snapshot — loading a saved view re-runs it against current live data. No foreign key into `projects`/`tasks`, so nothing to cascade-delete. |
| `people` | First-class person records — name, `weeklyCapacityHours`, `hourlyRate`, `active`. Joins to `Task.assignee` by exact name match, **not** an FK on `Task` — see "People and the assignee join" above. |
| `personTimeOff` | PTO/time-off ranges per person (`startDate`/`endDate` inclusive, a free-text `label`). Reduces that person's capacity on the Workload grid for the days it covers. |
| `timeEntries` | One logged block of time (`taskId`, `personId`, `date`, `minutes`, `billable`, `source: "timer" \| "manual"`). `projectId` is denormalized from the task at entry time — safe since tasks never change project after creation. |
| `activeTimers` | At most one row, always `id: "current"` — the single global running timer. `startedAt` is the only persisted state; elapsed time is always recomputed from it, never stored as a counter. |
| `automationRules` | Project-scoped rule = `trigger` + optional `condition` + `actions[]` — see "Automation" above. |
| `automationRunLog` | One row per rule *firing* (`ruleId`, `ruleName`, `projectId`, `taskId`, `taskTitle`, `trigger`, `summary`, `firedAt`), `[ruleId+taskId]` compound index for the overdue-sweep's dedupe check. `ruleName`/`taskTitle` are denormalized so a row stays readable after the rule or task it refers to is deleted. |
| `aiProviderConfig` | Single row, `id: "current"` (same pattern as `activeTimers`). All three providers' fields nested under their own key plus which one is active — see "AI provider..." above. |
| `comments` | Per-task/per-project threads. `author` is free text (no auth). `projectId`/`entityTitle` are denormalized — see "Comments" above and AGENTS.md. |
| `fieldChangeLog` | One row per tracked `Task`/`Project` field edit — the audit-log half of the activity feed. `fromValue`/`toValue` are already-resolved display strings, not raw stored values. See AGENTS.md for the exact tracked-field list. |
| `notificationReadState` | Read/dismissed ledger for the (never-stored) computed notification list, keyed by each notification's own deterministic id. Lazy-written — empty means everything's unread. |
| `savedSearches` | Named global-search filter sets — the same `list`/`create`/`delete` pattern as `savedReportViews`, applied to a `{text, entityTypes[]}` query blob instead of a `ReportFilters` object. |
| `projectTemplates` | A reusable project shape: task statuses + project-scoped custom field defs + tasks, dates stored as day offsets from the source project's own start rather than fixed dates. `sourceProjectId` is informational only — not a live FK, so deleting the source project doesn't touch templates made from it. See "Project templates" above and AGENTS.md. |

Cascading deletes are hand-rolled (IndexedDB has no `ON DELETE CASCADE`) —
see `deleteProject` and `deleteTask` in `src/lib/queries/`. Deleting a
project walks every task through `deleteTask` (which itself cleans up that
task's subtasks/attachments/customFieldValues/dependencies/recurrence,
`timeEntries`/a matching `activeTimer`, and now its `comments`/task-scoped
`notificationReadState` rows too) and then clears the project's own
statuses/fields/milestones/`automationRules`/`automationRunLog`/
`comments`/`fieldChangeLog`, all inside Dexie transactions. If you add a
table with a foreign key into `projects` or `tasks`, wire its cleanup into
the matching delete function. `deletePerson` (`src/lib/queries/people.ts`)
and `deleteTask` (for `automationRunLog`/`fieldChangeLog` specifically) are
the exceptions to "cascade everything": `deletePerson` deletes the
person's own `personTimeOff` rows and clears a matching `activeTimer`, but
deliberately leaves their `timeEntries` in place — a logged hour stays a
real historical fact even after the person record is removed (the UI
resolves a missing `personId` to "Deleted person" rather than crashing),
the same reasoning `deleteMilestone` already uses for tasks that referenced
a deleted milestone. `deleteTask` leaves `automationRunLog`/
`fieldChangeLog` rows referencing that task alone for the identical reason
(a past automation firing or field edit is a historical fact); `comments`
are different — they're owned content, not a log, so `deleteTask` *does*
cascade them, the same as subtasks/attachments. `deleteProject` still
clears `automationRules`/`automationRunLog`/`fieldChangeLog`/`comments` for
the whole project, since there's no project-scoped view left to ever read
an orphaned row again — see AGENTS.md. `projectTemplates` is a different
case again: it's never touched by `deleteProject` at all, on purpose — a
template is a snapshot copied by value, not a live reference into the
source project's rows, so there's nothing to orphan.

## Project structure

See [DEVELOPMENT.md](DEVELOPMENT.md#project-structure) for the full
source-tree map.

## Limitations

- No multi-user authentication or sync — this is a single-user, local-only
  app; the roles/permissions model is scaffolding for a future auth phase,
  not enforcement (see "Roles & permissions" above).
- Tables and lists (task tables, Gantt/Timeline rows) are simple and not
  virtualized — comfortable at personal-project scale, not built for
  thousands of rows in one view.
- Generated recurring task instances don't appear on the Gantt or Timeline
  (Calendar and Board still show them) — a daily rule can produce dozens of
  dated instances, which would flood a schedule view with entries that
  carry no real scheduling meaning.
- Burndown/burnup is reconstructed from each task's own dates on every
  render, not from a stored history — it can't reflect anything not kept
  on the task itself (e.g. a status that changed and changed back, or
  scope that was added and later deleted).
- Workload's PTO reduction assumes a flat 5-day work week — it doesn't
  model 4-day weeks, unusual schedules, or partial/half-day time off.
- Budget tracking is time-based only — there's no entry point for
  non-labor costs (software licenses, hardware, contractor invoices billed
  outside logged hours).
- Automation rules support at most one condition (one field, one value),
  not a multi-condition builder.
- An automation's "task became overdue" trigger fires once per task and
  never refires for that task, even if it's completed and later reopened
  past its due date again.
- The `/ask` natural-language query only understands the fields the report
  builder already has (project/status/priority/assignee/date-range/
  completed) — no tag filters, no boolean combinations beyond a single
  filter.
- Notifications are computed live from current data, not stored — there's
  no history of notifications that have since resolved.
- The notification digest is an in-app summary only; nothing is emailed or
  pushed, since this app has no backend to send from.
- Global search is plain case-insensitive substring matching, not fuzzy or
  ranked.
- Project templates capture task statuses, custom fields, and tasks only —
  dependencies, subtasks, milestones, and recurrence rules aren't part of a
  template snapshot.
- JSON export/import covers tasks, custom fields, dependencies, milestones,
  and subtasks — it deliberately excludes attachments, comments, the
  activity/audit log, automation rules, and time/budget data, so it isn't a
  full-fidelity backup of everything in the app.
- A blank "Assignee" on CSV export round-trips as the literal text
  "Unassigned" on re-import, not an empty value.
- The roles/permissions model (Owner/Editor/Viewer) is scaffolding, not
  working access control — there's no login, no session, and no server to
  enforce anything; the current single local user is always the most
  permissive role.

For the engineering rationale and trade-offs behind each of these, see
[DEVELOPMENT.md](DEVELOPMENT.md).
