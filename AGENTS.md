# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Start here

Read `README.md` first — it covers running the app, the design system, the
full Dexie schema (version 5) table-by-table, the four Phase 2 views
(Kanban/Gantt/Calendar/Timeline), the Phase 3 analytics dashboard (KPIs,
burndown/burnup, portfolio rollup, resource heatmap, trend charts,
drill-down, report builder), the Phase 4 workload/capacity view, time
tracking (timer + manual entries + timesheets), and budget tracking
(including the people/assignee modeling decision and the actual-cost
formula), the recurring-task generation mechanism, the Phase 5 automation
engine (triggers/conditions/actions, the run log Phase 6 reads), the risk
register, the pluggable AI provider client (LM Studio/OpenAI/Azure) and its
settings page, AI project summaries, natural-language task querying, and
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
- `ProjectFormDialog`'s budget estimate input had `min={0} step={100}` —
  another instance of the min/step-grid bug documented above (fixed here to
  `step={1}`, found while testing Phase 5's risk register against a real
  budget overrun). Any `<input type="number">` you touch, check this grid
  alignment even if it isn't the file you set out to change.

## Automation engine (Phase 5) — `src/lib/queries/automations.ts`

Rule = trigger (`statusChanged`→a specific `statusId`, `taskOverdue`, or
`taskCreated`) + one optional condition (priority/tag/assignee equals a
value) + one or more actions (`changeStatus`/`changePriority`/`addTag`/
`setAssignee`/`setCustomField`/`notify`). Rules are project-scoped
(`AutomationRule.projectId`), listed/edited from the project's Settings tab
(`AutomationRulesManager` + `AutomationRuleForm`) — see README for the full
UI walkthrough.

- **Actions never chain-trigger other rules.** `applyAction` mutates a task
  via `db.tasks.update(...)` directly, never through `queries/tasks.ts`'s
  `updateTask()` — that's the function that fires `statusChanged`
  automations in the first place. Routing an action's mutation back through
  it would let a misconfigured pair of rules (`status→A sets status→B`,
  `status→B sets status→A`) cascade forever. Every rule fires only off the
  *original* triggering event, one level deep, by construction — verified
  during Phase 5 testing with exactly that adversarial two-rule setup; it
  terminated in 2–3 firings, never a runaway loop. If you ever need actions
  to compose across rules, that's a deliberate redesign, not a tweak.
- **`taskOverdue` has no natural write-time hook** (nothing writes to a task
  the moment its due date passes, the same problem recurring-task
  generation solved differently — see README). `runOverdueAutomationSweep()`
  scans instead: called once on app mount, every 60s on an interval
  (`App.tsx`, mirroring the recurring-generation effect), and immediately
  after saving a rule with this trigger (`createAutomationRule`/
  `updateAutomationRule`, mirroring `setRecurrence`'s "show a result
  without waiting" precedent). It **dedupes by checking
  `automationRunLog`** for an existing `(ruleId, taskId, trigger)` entry
  (the `[ruleId+taskId]` compound index) before firing again — the log
  doubles as the "already handled" ledger. This is a simple, one-way
  ledger, not a resettable state machine: completing then re-opening a task
  past its due date won't refire the same rule for it again. Revisit only
  if a future phase needs that finer-grained behavior.
- **`AutomationRunLogEntry`** (`ruleId`, `ruleName`, `projectId`, `taskId`,
  `taskTitle`, `trigger`, `summary`, `firedAt`) is the shape Phase 6's
  notification center is meant to read from — one row per rule *firing*
  (every action a firing applied is folded into one `summary` string, and
  exactly one toast fires per firing, not per action). Keep it this flat
  and stable rather than growing it ad hoc.
- **Cascade-delete asymmetry, deliberate**: `deleteProject` removes both
  `automationRules` and `automationRunLog` rows for that project (no
  per-project view will ever exist to read an orphaned log again, so
  keeping them would just be permanent IndexedDB bloat). `deleteTask` does
  **not** touch `automationRunLog` — a firing against a since-deleted task
  is a historical fact (same reasoning `deletePerson` already uses for
  `timeEntries`; the log's denormalized `taskTitle`/`ruleName` keep every
  row readable regardless). Deleting a rule itself also leaves its past log
  entries in place, for the same reason.

## AI provider client (Phase 5) — `src/lib/ai/client.ts`, `src/lib/queries/ai-config.ts`

One `aiProviderConfig` Dexie row (`id: "current"`, same singleton pattern as
`ActiveTimer`) holds all three providers' fields nested under their own key
(`lmstudio`/`openai`/`azure`) plus which one is active — switching the
picker in `/settings/ai` never loses what was typed into the others. Every
chat/completion call goes through `chatCompletion()` in `client.ts`, which
branches on provider for **three genuinely different request shapes**:

| Provider | URL | Auth header | `model` in body? |
|---|---|---|---|
| LM Studio | `{baseUrl}/chat/completions` (default `http://localhost:1234/v1`) | none | yes, whatever's loaded (`listLmStudioModels()` hits `{baseUrl}/models`) |
| OpenAI | `https://api.openai.com/v1/chat/completions` (fixed, not user-editable) | `Authorization: Bearer <key>` | yes, user-typed (default `gpt-4o-mini`) |
| Azure OpenAI | `{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={apiVersion}` | `api-key: <key>` | **no** — the `deployment` in the URL path picks the model |

Verified against current Azure/OpenAI REST docs (Context7) before writing
this, not from memory — get an Azure OpenAI deployment/api-version detail
wrong and the client silently 404s instead of authenticating wrong.

- **Never `console.*` the config object or anything derived from an API
  key**, in this module or any caller. Failures return plain strings
  (`ChatCompletionResult`'s `error` field) for the UI to show — never the
  request/response object.
- **LM Studio's server needs its own "Enable CORS" setting on** for a
  browser `fetch` to reach it at all — confirmed live during Phase 5
  testing: `curl` against a real running LM Studio instance worked
  perfectly (proving the request/response shapes above are correct), but
  the exact same request from this app's own browser tab was blocked with
  `No 'Access-Control-Allow-Origin' header is present`. This is an LM
  Studio-side setting, not something the client code can detect or work
  around — `describeFetchError()` in `client.ts` surfaces a hint about it
  whenever a `fetch` to the `lmstudio` provider throws a `TypeError`
  (the CORS/network-failure signature). Point anyone hitting a mysterious
  "couldn't reach the server" with LM Studio visibly running at this.
- **`useLiveQuery` emits a brand-new object on every read**, even when
  nothing meaningful changed (e.g. an unrelated field's own autosave
  landing) — a `useEffect` keyed on that object's *reference* fires far
  more often than "the user actually edited something." `AiSettingsPage`
  hit this for real: a `useEffect(() => setTestResult(null), [config])`
  meant to invalidate a stale "Connected" result after an edit instead
  raced a field's `onBlur` autosave and silently wiped a just-arrived test
  result. Fixed by comparing serialized *values* (`JSON.stringify`) against
  a snapshot taken at test time, and marking the result "stale" in the UI
  instead of clearing it outright — feedback should never just vanish.
  Same caution applies to any future `useEffect` keyed on a live-query
  result.
- Radix `Select`'s `value` prop is fine left as `""` for "nothing chosen
  yet, show the placeholder" (only `Select.Item`'s own `value` can never be
  `""`) — `AutomationRuleForm`'s trigger-status/action-field selects use
  `value={x || undefined}` anyway for extra clarity that empty means
  unset, matching how every other Select in this app (`ReportBuilder`,
  `TaskDetailSheet`) always maps "nothing selected" to a real sentinel
  value (`"all"`, `"none"`) rather than leaving `value` empty.

## Risk register (Phase 5) — `src/lib/analytics/risks.ts`, `/risks`

Pure computation, no React, same shape as every other `lib/analytics/*`
module. Combines three independent sources into one `RiskItem[]`, sorted
severity-first: **overdue dependencies** (an incomplete, overdue
predecessor still blocking an incomplete successor — reuses
`normalizeDependencyEdges` from `dependency-graph.ts`, the same
normalization Gantt's critical path uses; severity is `"high"` once the
successor has *also* slipped past its own due date, `"medium"` while it's
merely at risk of it), **budget overruns** (reuses `computeProjectBudget`/
`budgetStatus` from Phase 4 verbatim — `"over"` is high severity, `"near"`
≥85% is a medium-severity heads-up before it actually breaks), and
**milestones** (user-marked `"at-risk"`/`"missed"` surfaced as-is, plus two
automatic derivations for a milestone still sitting in `"upcoming"`: a
target date already past reads as an undetected miss (high), one inside a
7-day window is an approaching heads-up (low); `"completed"` is never a
risk). Deliberately **not** the health-status green/amber/red badge colors
for severity — every row on this page already is a risk, so a "low"
severity row rendered green would contradict what green means everywhere
else in this app (HealthBadge, budget status). Low severity uses a plain
muted badge instead.

## Extending `ReportFilters` (Phase 5) — `src/lib/db.ts`, `src/lib/analytics/report.ts`

`ReportFilters` gained an optional `completed: boolean | null` field for
the `/ask` natural-language query feature (`null`/`true`/`false` mirroring
every other field's tri-state). No Dexie migration was needed — the type
lives inside `SavedReportView.filters`, a JSON blob field, not its own
indexed column, so every pre-existing saved view just has this field
`undefined`, which `applyReportFilters` treats identically to `null`. The
report builder's own UI still has no control for it and never sets it —
this pattern (extend the shared filter type, only wire UI where it's
actually needed) is the template for adding another filter dimension later
without touching every consumer.

**Two real bugs found in code review after initial ship, both fixed in
`applyReportFilters` itself** (so every consumer — report builder, `/ask`
— gets the fix, not just the one that surfaced it):

1. **`dateTo`/`dateFrom` used to compare raw epoch values, not calendar
   days.** `dueDate`/`startDate` are always local midnight in this app's
   own UI, so that happened to work for them, but `createdAt`/`completedAt`
   carry real time-of-day precision (`Date.now()`) — a task completed at
   3pm on the `dateTo` day was wrongly excluded from "completed by
   `dateTo`" because its raw epoch value is *after* `dateTo`'s own midnight
   value. Repro'd live via `/ask`: "what's overdue" (`dateTo` = yesterday)
   excluded a task due *later in the day* on that exact cutoff date. Fixed
   by comparing `startOfDay(dateValue)` against `startOfDay(filters.dateFrom
   /dateTo)` (`src/lib/analytics/date-buckets.ts`'s `startOfDay`) instead of
   the raw values — an inclusive day-bound now genuinely means the whole
   day, regardless of what time-of-day either side carries. Check any
   future date-range comparison in this codebase for the same raw-epoch
   trap if the field being compared isn't guaranteed to be exactly
   midnight.
2. **`filters.completed === false` checked `t.completedAt !== null` —
   strict, not defensive against a missing field.** `Task.completedAt` is
   typed `number | null` and every path through this app's own
   `createTask`/`updateTask` always sets it explicitly, so this was never
   wrong for real app data. But a task record from anywhere else (hand-
   written test/import data, a future migration that misses a field) with
   `completedAt` simply *absent* (`undefined`, not `null`) read as
   "completed" under the old `!== null` check and got wrongly excluded from
   an "only incomplete" filter. Fixed with `t.completedAt ?? null` before
   comparing — the same "coerce `undefined` to the field's real default"
   move `db.ts`'s own `.upgrade()` migrations already use for exactly this
   reason (see the Dexie schema section of README). Apply the same
   defensive coercion to any other nullable `Task`/`Project` field you
   compare with strict equality against data that might not have come
   through this app's own query functions.

## Natural-language querying (Phase 5) — `src/lib/ai/nl-query.ts`, `/ask`

The model's only job is turning a question into a `ReportFilters`-shaped
JSON object; `applyReportFilters` (existing, pure, already-tested) is what
actually computes the answer against real task data — the model never sees
or reports results, so it structurally can't hallucinate a task that
doesn't exist. `coerceToReportFilters()` is the safety net: every field the
model returns is checked against the real, live-fetched set of known
project ids / status names / `TASK_PRIORITIES` before use, and anything
that doesn't match is dropped to "no constraint," never left to silently
filter the result set to zero. The system prompt hands the model
pre-computed `today`/`yesterday` dates rather than asking it to do date
arithmetic — verified live against a real local 1.7B model (`qwen-3-1.7b-
instruct` via LM Studio) that a vaguer instruction ("dateTo yesterday, no
dateFrom for 'overdue'" stated implicitly) still let the model invent a
spurious `dateFrom`, silently narrowing "what's overdue" to the last day
and missing tasks overdue by longer than that. Spelling the rule out
explicitly ("do NOT invent a dateFrom for it") fixed it. Assume small local
models need this level of explicitness in any future prompt tweak here —
verify against a real model response, don't assume prompt wording that
"reads clearly" to a human will be followed by the model you're targeting.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
