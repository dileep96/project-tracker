# Project Tracker

A full-featured personal project, task, and portfolio tracker with a
beautiful, data-rich analytics dashboard. Local-first (no backend server) —
all data lives in the browser via IndexedDB.

Build plan and phase status are tracked in the parent firstmate home's
backlog (not in this repo).

This repo currently implements **Phase 1 (foundation)**, **Phase 2
(views)**, **Phase 3 (analytics)**, **Phase 4 (resource/time/budget
tracking)**, **Phase 5 (automation, risk register, AI)**, and **Phase 6
(comments, activity feed, notifications, search)**: app shell, data layer,
project/task CRUD, the List/Table view, Kanban board, Gantt chart with
critical-path analysis, Calendar, the portfolio Timeline, recurring-task
instance generation, the executive dashboard (KPIs, burndown/burnup,
portfolio rollup, resource heatmap, trend charts, a click-to-filter
drill-down, and a report builder with CSV/PDF/Excel export), a
workload/capacity view, a built-in timer plus manual time entry with
timesheets, estimated-vs-actual budget tracking per project/task,
project-scoped automation rules with a run log, a cross-project risk
register, AI features (a pluggable LM Studio/OpenAI/Azure OpenAI client,
per-project AI-generated status summaries, and a natural-language task
query page) behind a settings page at `/settings/ai`, per-task/per-project
comment threads, a unified activity feed/audit log, an in-app notification
center with deadline reminders and a digest, and global search
(Cmd/Ctrl+K) with saved filters. The dashboard's "Budget burn rate" KPI now
computes a real value from that budget data (see Phase 4 section below) —
the honest "not enough data yet" state Phase 3 shipped it with only shows
again if no project has a budget estimate set yet. Real multi-user
auth/sync, templates, and import-export/RBAC are later phases — Phase 6
builds *toward* multi-user shape (e.g. a free-text comment author) without
adding actual accounts.

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
- AI features (Phase 5) add **zero new dependencies** — `src/lib/ai/
  client.ts` talks to LM Studio/OpenAI/Azure OpenAI with plain `fetch`
  against their REST APIs directly, no provider SDK. No client-side LLM
  runtime either — every provider is a real HTTP endpoint.
- Global search (Phase 6) adds **one new dependency**: `cmdk`, via shadcn's
  `Command`/`CommandDialog` primitives (`npx shadcn add command`, which
  also generated `src/components/ui/input-group.tsx` as a dependency) —
  the Cmd/Ctrl+K palette. Everything else in Phase 6 (comments, the
  activity feed, notifications, saved searches) is plain Dexie + React,
  no new packages.

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

## Automation — Phase 5

Project settings' **Automations** section (a new subsection alongside Task
statuses/Custom fields, not a separate page) lists, creates, and edits
project-scoped rules: a **trigger**, an optional **condition**, and one or
more **actions**.

- **Triggers**: task status changes to a specific status, a task becomes
  overdue, or a task is created.
- **Condition** (optional, at most one): priority equals / has tag / assignee
  equals a value — a single extra guard, not a general condition builder.
- **Actions**: change status, change priority, add a tag, set assignee, set
  a custom field's value, or **notify** — a log-only action for when a rule's
  real intent is alerting someone. This app has no notification center yet
  (that's Phase 6), so `notify` writes one row to a lightweight
  **automation run log** (rule name, task affected, what happened, when)
  and shows a toast the moment it fires, instead of any real delivery.
  Every action a single rule firing applies is folded into that one log row
  and one toast, not one per action.

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
`src/lib/queries/automations.ts` and AGENTS.md for the full mechanism —
this is the log/event shape Phase 6's notification center is expected to
read from.

## Risk register — `/risks` (Phase 5)

One cross-project view surfacing every real at-risk item, sorted by
severity, with a click-through straight to the affected task (opens
`TaskDetailSheet`) or project. Three sources, computed live (no separate
risk table — same "recompute from real data on every render" philosophy as
the Phase 3 dashboard):

- **Overdue task dependencies** — an incomplete, overdue task still blocking
  another incomplete task, reusing the same dependency-edge normalization
  the Gantt critical-path pass builds on.
- **Budget overruns** — a project whose actual cost (Phase 4) has passed, or
  is closing in on, its budget estimate.
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

## AI provider, summaries, and natural-language querying — Phase 5

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

Config persists to a new `aiProviderConfig` Dexie table (plain-text API
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
type/shape the Phase 3 report builder already uses) and runs it through the
existing `applyReportFilters`, rendering the result through the same
`TaskTable` every other view uses. The model's only job is proposing a
filter; every field it returns is validated against the real, live set of
known projects/statuses/priorities before being trusted, so a hallucinated
status name (or any other bad value) is dropped to "no constraint" rather
than silently producing an empty or wrong result. See
`src/lib/ai/{client,summary,nl-query}.ts` and AGENTS.md for the full
request shapes, the validation approach, and a real prompt-engineering
lesson learned by testing against a small local model.

## Comments, activity feed, notifications & search — Phase 6

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
sources: **field changes** (a new `fieldChangeLog` table — see AGENTS.md
for exactly which `Task`/`Project` fields are tracked and why automation
actions never appear here twice), **comments**, and **Phase 5's automation
run log** (read directly, not re-detected). A project's Activity tab
already shows the combined view across every one of its tasks too — see
AGENTS.md for how that's made a single indexed query rather than a
per-task fan-out.

### Notification center — bell icon (sidebar footer on desktop, header on mobile)

Click the bell for a panel with two tabs: **Notifications** (deadline
reminders for overdue/due-soon tasks, Phase 5 automation firings, and
Phase 5 risks — all computed live, never stored, same philosophy as the
risk register itself) and **Digest** (Today / This week toggle,
summarizing tasks created/completed/due, comments posted, automations run,
and current active-risk count for that window — an in-app summary, not a
sent email, since this app has no backend to send one from). Unread state
persists in a small `notificationReadState` table; clicking a notification
marks it read and opens the task (or navigates to the project, for
risk/automation notifications with no single task). See AGENTS.md for the
exact notification-id scheme and digest period math.

### Global search — `Cmd/Ctrl+K` from anywhere

A command-palette search across projects, tasks, and comments
(`src/lib/search.ts`, plain substring matching), with type filter chips and
**saved searches** — name the current query/filter combination for
one-click reuse later, persisted the same way Phase 3's report-builder
saved views are (a `savedSearches` table storing the query itself, re-run
against live data on load, not a result snapshot).

## Dexie schema (version 6)

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
`null` for pre-existing rows via `.upgrade()`. Version 5 (Phase 5) adds
three more brand-new tables (`automationRules`, `automationRunLog`,
`aiProviderConfig`) — again no `.upgrade()` needed, same as v3. Version 6
(Phase 6) adds four more brand-new tables (`comments`, `fieldChangeLog`,
`notificationReadState`, `savedSearches`) — same as v3/v5, no `.upgrade()`
needed. Note for future phases: a Dexie upgrade transaction has access to
every table in the database, not just the ones a given version's
`.stores()` call lists — v4's `.upgrade()` modifies `tasks`/`projects` rows
even though their index strings are unchanged from earlier versions; only
the tables whose *indexes* change need to appear in that version's
`.stores()` object.

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
| `automationRules` (v5) | Project-scoped rule = `trigger` + optional `condition` + `actions[]` — see "Automation" above. |
| `automationRunLog` (v5) | One row per rule *firing* (`ruleId`, `ruleName`, `projectId`, `taskId`, `taskTitle`, `trigger`, `summary`, `firedAt`), `[ruleId+taskId]` compound index for the overdue-sweep's dedupe check. `ruleName`/`taskTitle` are denormalized so a row stays readable after the rule or task it refers to is deleted. |
| `aiProviderConfig` (v5) | Single row, `id: "current"` (same pattern as `activeTimers`). All three providers' fields nested under their own key plus which one is active — see "AI provider..." above. |
| `comments` (v6) | Per-task/per-project threads. `author` is free text (no auth). `projectId`/`entityTitle` are denormalized — see "Comments" above and AGENTS.md. |
| `fieldChangeLog` (v6) | One row per tracked `Task`/`Project` field edit — the audit-log half of the activity feed. `fromValue`/`toValue` are already-resolved display strings, not raw stored values. See AGENTS.md for the exact tracked-field list. |
| `notificationReadState` (v6) | Read/dismissed ledger for the (never-stored) computed notification list, keyed by each notification's own deterministic id. Lazy-written — empty means everything's unread. |
| `savedSearches` (v6) | Named global-search filter sets — the same `list`/`create`/`delete` pattern as `savedReportViews`, applied to a `{text, entityTypes[]}` query blob instead of a `ReportFilters` object. |

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
an orphaned row again — see AGENTS.md.

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
      risks.ts                    Phase 5: overdue-dependency/budget/milestone risk register
      activity.ts                  Phase 6: merges field changes + comments + automation log into one feed
      notifications.ts             Phase 6: deadline/automation/risk notifications + digest, computed live
    ai/                       Phase 5: pluggable AI client + feature logic, no React
      client.ts                  chatCompletion/listLmStudioModels/testAiProviderConnection — 3 provider shapes
      summary.ts                  Project-summary context builder + prompt
      nl-query.ts                  NL question -> ReportFilters, with defensive coercion
    chart-theme.ts           Shared Recharts colors/styles (CSS-var-backed, theme-reactive)
    format.ts                Phase 4: shared hours/currency/duration formatting
    search.ts                 Phase 6: substring search across projects/tasks/comments
    queries/                CRUD + cascade-delete functions, one file per entity
      report-views.ts          Saved report-view CRUD (Phase 3)
      people.ts                 Phase 4: people + PTO CRUD
      time-entries.ts            Phase 4: manual time entries + the global timer's start/stop
      automations.ts              Phase 5: rule CRUD + trigger/condition/action engine + run log
      ai-config.ts                 Phase 5: AI provider config CRUD
      comments.ts                   Phase 6: comment thread CRUD
      activity.ts                    Phase 6: field-change diffing + writes (called from tasks.ts/projects.ts) + reads
      notifications.ts               Phase 6: notification read-state CRUD
      saved-searches.ts              Phase 6: saved-search CRUD (mirrors report-views.ts)
  hooks/                    useLiveQuery wrappers (reactive reads) + theme context
    use-people.ts              Phase 4
    use-time-entries.ts         Phase 4 (includes useActiveTimer)
    use-automations.ts           Phase 5
    use-ai-config.ts              Phase 5
    use-comments.ts                Phase 6
    use-activity.ts                 Phase 6: per-task/per-project merged feed
    use-notifications.ts             Phase 6: the full live-computed notification list
    use-saved-searches.ts             Phase 6
  components/
    ui/                      shadcn-generated primitives (owned, customized — see index.css)
                              command.tsx/input-group.tsx (Phase 6) generated by `npx shadcn add command`
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
    automations/                Phase 5: AutomationRulesManager, AutomationRuleForm, AutomationRunLogList
    ai/                         Phase 5: ProjectSummaryPanel (+ shared AiNotConfiguredNotice)
    comments/                    Phase 6: CommentsPanel, CommentItem
    activity/                    Phase 6: ActivityFeed (task/project detail tabs)
    notifications/                Phase 6: NotificationBell, NotificationPanel (+ its Digest tab)
    search/                        Phase 6: CommandPalette (Cmd/Ctrl+K)
  pages/                     Route-level components (ProjectsPage, ProjectDetailPage, AllTasksPage,
                              BoardPage(+Picker), GanttPage(+Picker), CalendarPage, TimelinePage,
                              WorkloadPage, TimesheetsPage — Phase 4,
                              DashboardPage — lazy-loaded, see App.tsx,
                              RisksPage, AiSettingsPage, AskPage — Phase 5)
                              -- Phase 6 has no new pages: the notification bell and Cmd/Ctrl+K search
                                 are global overlays mounted in AppShell, not routes.
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
- Automation rules (Phase 5) support at most one condition (one field, one
  value), not an AND/OR condition builder — kept to what a rule's own UI
  can present as a single row rather than a mini query language. Revisit
  only if a real rule genuinely needs to combine more than one guard.
- The "task became overdue" trigger's dedupe (Phase 5) is a one-way ledger
  keyed off `automationRunLog` — once a rule has fired for a task via this
  trigger, it never fires again for that same task, even if the task is
  completed and later reopened past its due date again. This is
  deliberately simple rather than a resettable "became overdue" event;
  revisit only if a future use case needs that finer-grained re-triggering.
- `/ask`'s natural-language query only maps to the fields `ReportFilters`
  already has (project/status/priority/assignee/date-range/completed) — no
  tag filter, no boolean AND/OR combos beyond what a single filter object
  expresses. This mirrors the report builder's own scope; extend
  `ReportFilters` first (see AGENTS.md) if a future question needs a field
  it doesn't have yet, rather than asking the model to interpret something
  the filter layer can't express.
- Notifications (Phase 6) are computed live from real data on every render,
  never persisted — only *read state* is stored. A notification's "at"
  timestamp and content can never go stale, but there's also no history of
  notifications that have since resolved (e.g. a task that was overdue and
  got completed just stops producing one, with no record it ever fired).
  Revisit only if a future need genuinely requires a notification history,
  not just "what needs my attention right now."
- The digest (Phase 6) is an in-app summary view, not a scheduled or sent
  email/push notification — this app has no backend to send from. If a
  future phase adds one, the digest's period-math (`computeDigest`) is
  already the right place to reuse, not rewrite.
- Global search (Phase 6) is plain case-insensitive substring matching, not
  fuzzy/ranked — fine at personal-project scale, matching the same
  trade-off `DependenciesPanel`'s own task-search popover already accepts.
  Revisit with real ranking only if the result set grows large enough that
  substring matches start feeling noisy.
- Opening a task from global search or a notification uses a second,
  app-shell-level `TaskDetailSheet` instance separate from the page-local
  one most pages already manage for their own in-page task rows — in the
  narrow case where both are triggered at once, two sheets can theoretically
  be open simultaneously. See AGENTS.md's Global search section.
