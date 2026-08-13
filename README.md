# Project Tracker

A full-featured personal project, task, and portfolio tracker with a
beautiful, data-rich analytics dashboard. Local-first (no backend server) —
all data lives in the browser via IndexedDB.

Build plan and phase status are tracked in the parent firstmate home's
backlog (not in this repo).

This repo currently implements **Phase 1: foundation** — app shell, data
layer, project/task CRUD, and the List/Table view. Kanban/Gantt/Calendar/
Timeline, the analytics dashboard, resource/time/budget tracking,
automation, collaboration, and templates/import-export/RBAC are later
phases; their nav entries exist in the sidebar already (shown disabled with
a "Soon" badge) so later phases only add routes, not restructure the shell.

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

## Dexie schema (version 1)

All tables live in `src/lib/db.ts`. Every future phase should add a new
`db.version(N).stores({...})` call (with an `.upgrade()` migration if data
needs transforming) rather than editing version 1 — see Dexie's docs on
[schema versioning](https://dexie.org/docs/Tutorial/Design#database-versioning).

| Table | Notes |
|---|---|
| `projects` | `status` is free text with UI-suggested defaults, not an enum. `health` is `'green' \| 'amber' \| 'red'`. |
| `taskStatuses` | Each **project** owns its own ordered workflow (seeded with To Do / In Progress / Done on project creation, fully editable). Tasks reference `statusId`, not a name — renaming a status never orphans data. **This table is the column model Phase 2's Kanban board should read directly** (`order` field included). |
| `tasks` | `statusId` FK into the *same project's* `taskStatuses`. `completedAt` is independent of `statusId` (the row checkbox toggles it) — useful for cycle-time/burndown analytics later without depending on workflow-column semantics. |
| `subtasks` | Ordered checklist items per task. |
| `customFieldDefs` | `projectId: null` = global field (applies to every project); otherwise project-scoped. |
| `customFieldValues` | One row per `(taskId, fieldId)`, unique via the `[taskId+fieldId]` compound index. Value is always stored as a string and parsed per `CustomFieldDef.type` on read. |
| `attachments` | Blob stored directly in IndexedDB (`blob: Blob`), not the filesystem. |
| `taskDependencies` | `dependsOnTaskId` is **not** scoped to the same project as `taskId` — cross-project dependencies are supported by design. |
| `recurrenceRules` | Schema-complete (`&taskId` unique index — one rule per task); *generating* recurring instances from the rule is a Phase 2 stub. `Task.isRecurring` mirrors whether a rule exists. |
| `milestones` | Per-project; tasks reference `milestoneId` optionally. |

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
    db.ts              Dexie schema + shared domain types
    ids.ts              id/timestamp helpers
    queries/             CRUD + cascade-delete functions, one file per entity
  hooks/                 useLiveQuery wrappers (reactive reads) + theme context
  components/
    ui/                   shadcn-generated primitives (owned, customized — see index.css)
    layout/                App shell: sidebar, mobile drawer, nav registry, theme toggle
    projects/               Project card, create/edit dialog, health badge
    tasks/                   Table, inline-edit cells, status/priority selects, task detail panel + its sub-panels
    milestones/              Milestone manager
  pages/                  Route-level components (ProjectsPage, ProjectDetailPage, AllTasksPage)
```

## Known trade-offs (intentional, revisit if a later phase needs otherwise)

- Table pagination is simple page-based (25 rows/page), not virtualized —
  fine at personal-project scale; revisit if a phase needs thousands of
  rows in one table.
- No optimistic-UI layer — Dexie writes are fast enough locally that
  `useLiveQuery` re-render latency hasn't been an issue. Introduce one if
  a future phase adds slower operations (e.g. large imports).
