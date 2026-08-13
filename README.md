# Project Tracker

A full-featured personal project, task, and portfolio tracker with a
beautiful, data-rich analytics dashboard. Local-first (no backend server) —
all data lives in the browser via IndexedDB.

Build plan and phase status are tracked in the parent firstmate home's
backlog (not in this repo).

This repo currently implements **Phase 1 (foundation)** and **Phase 2
(views)**: app shell, data layer, project/task CRUD, the List/Table view,
Kanban board, Gantt chart with critical-path analysis, Calendar, the
portfolio Timeline, and recurring-task instance generation. The analytics
dashboard, resource/time/budget tracking, automation, collaboration, and
templates/import-export/RBAC are later phases; the Dashboard nav entry
exists in the sidebar already (shown disabled with a "Soon" badge) so that
phase only adds a route, not a shell restructure.

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

## Dexie schema (version 2)

All tables live in `src/lib/db.ts`. Every future phase should add a new
`db.version(N).stores({...})` call (with an `.upgrade()` migration if data
needs transforming) rather than editing an existing version — see Dexie's
docs on
[schema versioning](https://dexie.org/docs/Tutorial/Design#database-versioning).
Version 2 (Phase 2) adds `Task.recurrenceParentId` — see "Recurring task
generation" above.

| Table | Notes |
|---|---|
| `projects` | `status` is free text with UI-suggested defaults, not an enum. `health` is `'green' \| 'amber' \| 'red'`. |
| `taskStatuses` | Each **project** owns its own ordered workflow (seeded with To Do / In Progress / Done on project creation, fully editable). Tasks reference `statusId`, not a name — renaming a status never orphans data. **This table is the column model Phase 2's Kanban board should read directly** (`order` field included). |
| `tasks` | `statusId` FK into the *same project's* `taskStatuses`. `completedAt` is independent of `statusId` (the row checkbox toggles it) — useful for cycle-time/burndown analytics later without depending on workflow-column semantics. `recurrenceParentId` (v2) FKs to the template task a generated instance came from, or `null`. |
| `subtasks` | Ordered checklist items per task. |
| `customFieldDefs` | `projectId: null` = global field (applies to every project); otherwise project-scoped. |
| `customFieldValues` | One row per `(taskId, fieldId)`, unique via the `[taskId+fieldId]` compound index. Value is always stored as a string and parsed per `CustomFieldDef.type` on read. |
| `attachments` | Blob stored directly in IndexedDB (`blob: Blob`), not the filesystem. |
| `taskDependencies` | `dependsOnTaskId` is **not** scoped to the same project as `taskId` — cross-project dependencies are supported by design. `addDependency` (`src/lib/queries/tasks.ts`) rejects self-dependencies and anything that would close a cycle across the *whole* graph, not just this task's own edges — the Gantt critical-path pass assumes an acyclic graph. |
| `recurrenceRules` | `&taskId` unique index — one rule per task. Generation lives in `src/lib/recurrence.ts` (see "Recurring task generation" above). `Task.isRecurring` mirrors whether a rule exists — only the template task, never a generated instance. |
| `milestones` | Per-project; tasks reference `milestoneId` optionally. Surfaced as read-only markers on Gantt and Timeline. |

Cascading deletes are hand-rolled (IndexedDB has no `ON DELETE CASCADE`) —
see `deleteProject` and `deleteTask` in `src/lib/queries/`. Deleting a
project walks every task through `deleteTask` (which itself cleans up that
task's subtasks/attachments/customFieldValues/dependencies/recurrence) and
then clears the project's own statuses/fields/milestones, all inside Dexie
transactions. If you add a table with a foreign key into `projects` or
`tasks`, wire its cleanup into the matching delete function.

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
    queries/                CRUD + cascade-delete functions, one file per entity
  hooks/                    useLiveQuery wrappers (reactive reads) + theme context
  components/
    ui/                      shadcn-generated primitives (owned, customized — see index.css)
    layout/                   App shell: sidebar, mobile drawer, nav registry, theme toggle
    projects/                  Project card, create/edit dialog, health badge, project picker (Board/Gantt landing)
    tasks/                      Table, inline-edit cells, status/priority selects, task detail panel + its sub-panels
    milestones/                 Milestone manager
    board/                      Kanban board/column/card
    gantt/                      Gantt chart + SVG dependency-link overlay
    calendar/                   Month calendar grid
    timeline/                   Portfolio timeline bands
  pages/                     Route-level components (ProjectsPage, ProjectDetailPage, AllTasksPage,
                              BoardPage(+Picker), GanttPage(+Picker), CalendarPage, TimelinePage)
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
