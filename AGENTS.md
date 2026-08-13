# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Start here

Read `README.md` first — it covers running the app, the design system, the
full Dexie schema (version 1) table-by-table, and known trade-offs. This
file only adds what isn't already there.

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
  `src/lib/db.ts`, never an edit to version 1 — see README's Dexie section.
- IndexedDB has no cascading deletes. Any new table with a foreign key into
  `projects` or `tasks` needs its cleanup wired into `deleteProject`/
  `deleteTask` in `src/lib/queries/`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
