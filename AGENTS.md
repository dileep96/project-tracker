# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Start here

Read `README.md` first — it covers running the app, the design system, the
full Dexie schema (version 4) table-by-table, the four Phase 2 views
(Kanban/Gantt/Calendar/Timeline), the Phase 3 analytics dashboard (KPIs,
burndown/burnup, portfolio rollup, resource heatmap, trend charts,
drill-down, report builder), the Phase 4 workload/capacity view, time
tracking (timer + manual entries + timesheets), and budget tracking
(including the people/assignee modeling decision and the actual-cost
formula), the recurring-task generation mechanism, and known trade-offs.
This file only adds what isn't already there.

## Sharp edges

- **`src/index.css` must keep `@import "shadcn/tailwind.css";`.** It defines
  the `data-active`/`data-open`/`data-closed`/`data-horizontal`/etc. custom
  Tailwind variants every generated `src/components/ui/*` component depends
  on. Drop it and components still render, but their conditional styling
  silently no-ops (e.g. `Tabs` loses `flex-col` and its content renders
  squeezed off-screen at the far right of the viewport) — no build error,
  no console error, just broken layout you have to visually catch. If you
  ever rewrite the design tokens in `index.css`, keep this import.
- Don't put shadcn's `ScrollArea` inside a `flex`/`Tabs` layout — Radix's
  `Viewport` sizes via an internal table-display wrapper that fights
  `flex-1` children. Use a plain `<div className="overflow-y-auto">` with
  an explicit height instead (see `TaskDetailSheet`).
- Dexie schema changes belong in a new `db.version(N).stores({...})` call in
  `src/lib/db.ts`, never an edit to an existing version (currently 4) — see
  README's Dexie section. A version's `.upgrade()` callback can touch any
  table in the database via `tx.table(name)`, not just ones listed in that
  version's own `.stores()` — v4 backfills plain (non-indexed) new fields
  on `tasks`/`projects` this way without redeclaring their index strings as
  changed. Only list a table in `.stores()` when its *indexes* change.
- IndexedDB has no cascading deletes. Any new table with a foreign key into
  `projects` or `tasks` needs its cleanup wired into `deleteProject`/
  `deleteTask` in `src/lib/queries/`. Same goes for the self-referencing FK
  `Task.recurrenceParentId` — `deleteTask` already cascades template ->
  generated instances; extend that helper, don't add a second deletion path.
  `deleteTask`'s cascade now also covers `timeEntries`/`activeTimers`
  (Phase 4); `deletePerson` (`queries/people.ts`) is a deliberate partial
  exception — it cascades `personTimeOff` but leaves `timeEntries` alone,
  since a logged hour is a historical fact independent of whether the
  person record still exists (see README's Phase 4 section).
- **`<input type="number">`'s `min` and `step` must land on the same grid,
  or the browser silently rejects otherwise-valid values.** `min={0.05}
  step={0.25}` looks like "smallest entry 0.05, quarter-hour increments"
  but the native step-validation grid is `min + n*step`, so a very natural
  value like `3` is invalid (it's not `0.05 + n*0.25` for any integer `n`)
  — the input gets `aria-invalid`/blocks form submission with no visible
  error unless you go looking, easy to ship unnoticed. Bit Phase 4's hour
  inputs (`TaskTimePanel`, `ManualTimeEntryDialog`) until fixed to
  `min={0.25} step={0.25}` (min itself is the first grid point). Check this
  alignment on any new numeric input that sets both props.
- **A `TabsList` with too many triggers overflows past its container at
  mobile width** — each `TabsTrigger` is `flex-1` with `whitespace-nowrap`,
  which refuses to shrink below its label's min-content width, so the
  whole bar can grow wider than its parent instead of wrapping or
  compressing. `TaskDetailSheet`'s tab bar hit this the moment Phase 4
  added a 7th tab ("Time") — fixed with `overflow-x-auto` on the
  `TabsList` itself so it scrolls horizontally within the sheet instead of
  visually escaping it. Re-check this any time a tab is added to a
  `TabsList` that's already near this width, especially inside a
  fixed-width `Sheet`/`Dialog`.
- Setting only `overflow-x` on a scroll container doesn't leave `overflow-y`
  at `visible` — per the CSS overflow spec, pairing a non-`visible` axis
  with `visible` on the other silently promotes the `visible` one to
  `auto`, so an `overflow-x-auto` pane still clips/scrolls vertically the
  moment its content overflows, fighting a sticky header inside it. Gantt,
  Timeline, and the Phase 3 resource heatmap (`components/gantt`,
  `components/timeline`, `components/dashboard/ResourceHeatmap.tsx`) all
  sidestep this with one explicit `max-h-[Npx] overflow-auto` container for
  both axes together (a real frozen-header/frozen-column data grid) instead
  of trying to keep horizontal scroll local and vertical scroll on the
  page. Reach for the same pattern before inventing another one for a
  future dense grid.
- **Recharts axis labels can render with part of certain glyphs silently
  clipped** — no error, no warning, just a "3" or "5" missing its left
  curve (easy to mistake for a font bug or a mirrored character). Cause: a
  negative `margin.left` on the chart (a common trick to remove the default
  axis gutter) combined with a `YAxis` `width` too narrow for the tick
  text — `text-anchor="end"` ticks extend *leftward* from their anchor, and
  the negative margin can push part of that text past the SVG's own left
  edge (x=0), where it's clipped. Changing the tick font/size does not fix
  this. Fix: `margin.left: 0` (or positive) and a comfortably wide `YAxis
  width` (36px+ for 1-2 digit numbers) — see `src/lib/chart-theme.ts` and
  `components/dashboard/{BurndownChart,TrendCharts}.tsx`. Verify any new
  chart's axis digits at real zoom, not just that the chart renders.
- Chart colors are a **sequential teal ramp** (`--chart-seq-100..700`,
  light+dark, in `index.css`, consumed via `src/lib/chart-theme.ts`)
  anchored on the app's own `--primary` hue — deliberately not a
  chart-library default categorical palette. The dashboard's charts are
  single-hue/status-color only by design (see README's dataviz rationale in
  the Phase 3 section); reuse this ramp for any new chart rather than
  introducing a rainbow categorical set.
- **Phase 4 modeling decision**: `Person` (Phase 4) is a first-class table,
  but `Task.assignee` stays free text and joins to it by exact name match —
  no `personId` FK was added to `Task`. Actual cost is always `logged time
  × the logging person's hourly rate` (per-person, not per-task/project),
  summed regardless of the entry's `billable` flag (that flag is for
  invoicing filters, not cost accounting). Full rationale for both in
  README's "People and the assignee join" and "Budget tracking" sections —
  read those before changing either.
- The report builder's `.xlsx` export uses `write-excel-file`, not the more
  common `xlsx`/SheetJS package — the npm `xlsx` registry version carries
  two unpatched advisories (prototype pollution, ReDoS) with `npm audit`
  flagging them and no fix available. `write-excel-file` is a small,
  write-only library (no untrusted-parsing code path) with zero advisories.
  Don't reach for `xlsx` without re-checking whether it's been fixed.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
