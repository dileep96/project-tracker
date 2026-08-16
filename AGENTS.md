# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Start here

Read `README.md` first — it covers running the app, the design system, the
full Dexie schema (version 3) table-by-table, the four Phase 2 views
(Kanban/Gantt/Calendar/Timeline), the Phase 3 analytics dashboard (KPIs,
burndown/burnup, portfolio rollup, resource heatmap, trend charts,
drill-down, report builder), the recurring-task generation mechanism, and
known trade-offs. This file only adds what isn't already there.

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
  `src/lib/db.ts`, never an edit to an existing version (currently 3) — see
  README's Dexie section.
- IndexedDB has no cascading deletes. Any new table with a foreign key into
  `projects` or `tasks` needs its cleanup wired into `deleteProject`/
  `deleteTask` in `src/lib/queries/`. Same goes for the self-referencing FK
  `Task.recurrenceParentId` — `deleteTask` already cascades template ->
  generated instances; extend that helper, don't add a second deletion path.
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
