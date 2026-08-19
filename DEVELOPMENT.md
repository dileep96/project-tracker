# Development history

This file tracks how Project Tracker was built — the phases it shipped in,
schema version history, project structure, and the engineering trade-offs
behind it. For what the app does today, how to run it, and how data is
stored and exported, see [README.md](README.md).

## Build phases

This app shipped in seven phases:

- **Phase 1 — Foundation**: app shell, data layer, project/task CRUD.
- **Phase 2 — Views**: the List/Table view, Kanban board, Gantt chart with
  critical-path analysis, Calendar, the portfolio Timeline, and
  recurring-task instance generation.
- **Phase 3 — Analytics**: the executive dashboard (KPIs, burndown/burnup,
  portfolio rollup, resource heatmap, trend charts, a click-to-filter
  drill-down, and a report builder with CSV/PDF/Excel export).
- **Phase 4 — Resource, time & budget tracking**: a workload/capacity view,
  a built-in timer plus manual time entry with timesheets, and
  estimated-vs-actual budget tracking per project/task.
- **Phase 5 — Automation, risk register & AI**: project-scoped automation
  rules with a run log, a cross-project risk register, and AI features (a
  pluggable LM Studio/OpenAI/Azure OpenAI client, per-project AI-generated
  status summaries, and a natural-language task query page).
- **Phase 6 — Comments, activity feed, notifications & search**:
  per-task/per-project comment threads, a unified activity feed/audit log,
  an in-app notification center with deadline reminders and a digest, and
  global search (Cmd/Ctrl+K) with saved filters.
- **Phase 7 — Templates, import/export & RBAC scaffolding**: reusable
  project templates with relative-date task generation, JSON export/import
  (a project or the whole database) and CSV export/import for tasks, and a
  roles/permissions data model laying the groundwork for real access
  control.

Build plan and phase status were tracked in the parent firstmate home's
backlog, not in this repo.

## Schema version history

All tables live in `src/lib/db.ts`. Every future phase should add a new
`db.version(N).stores({...})` call (with an `.upgrade()` migration if data
needs transforming) rather than editing an existing version — see Dexie's
docs on
[schema versioning](https://dexie.org/docs/Tutorial/Design#database-versioning).

Version 2 (Phase 2) adds `Task.recurrenceParentId` — see README's
"Recurring task generation" section. Version 3 (Phase 3) adds
`savedReportViews` — a brand-new table, so no `.upgrade()` was needed.
Version 4 (Phase 4) adds four brand-new tables (`people`, `personTimeOff`,
`timeEntries`, `activeTimers`) plus two plain (non-indexed) fields on
existing tables — `Task.estimatedHours` and `Project.budgetEstimate` —
both backfilled to `null` for pre-existing rows via `.upgrade()`. Version 5
(Phase 5) adds three more brand-new tables (`automationRules`,
`automationRunLog`, `aiProviderConfig`) — again no `.upgrade()` needed,
same as v3. Version 6 (Phase 6) adds four more brand-new tables
(`comments`, `fieldChangeLog`, `notificationReadState`, `savedSearches`) —
same as v3/v5, no `.upgrade()` needed. Version 7 (Phase 7) adds one
brand-new table (`projectTemplates`) plus one plain field,
`Project.startDate` — backfilled to `null` for pre-existing rows via
`.upgrade()`, the same pattern v4 used for `budgetEstimate`/
`estimatedHours`.

Note for future phases: a Dexie upgrade transaction has access to every
table in the database, not just the ones a given version's `.stores()`
call lists — v4's `.upgrade()` modifies `tasks`/`projects` rows even
though their index strings are unchanged from earlier versions; only the
tables whose *indexes* change need to appear in that version's `.stores()`
object.

For the current schema, table by table, see README's "Data model" section.

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
    permissions.ts            Phase 7: Role/Permission model + hasPermission() — scaffolding, not enforcement
    io/                        Phase 7: JSON/CSV import & export, no React
      export.ts                  Build project/full ExportBundle, download as JSON (reuses report.ts's blob helper)
      import.ts                   Validate + import JSON bundles; parse/validate/import CSV tasks
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
      templates.ts                    Phase 7: saveProjectAsTemplate / createProjectFromTemplate / list / delete
  hooks/                    useLiveQuery wrappers (reactive reads) + theme context
    use-people.ts              Phase 4
    use-time-entries.ts         Phase 4 (includes useActiveTimer)
    use-automations.ts           Phase 5
    use-ai-config.ts              Phase 5
    use-comments.ts                Phase 6
    use-activity.ts                 Phase 6: per-task/per-project merged feed
    use-notifications.ts             Phase 6: the full live-computed notification list
    use-saved-searches.ts             Phase 6
    use-templates.ts                   Phase 7
    use-role.ts                         Phase 7: useCurrentRole() — always "owner" today, see AGENTS.md
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
    templates/                      Phase 7: SaveAsTemplateDialog, CreateProjectFromTemplateDialog
    data/                             Phase 7: ProjectDataSettings (Settings tab's Data section),
                                       ImportJsonDialog, ImportCsvTasksDialog
  pages/                     Route-level components (ProjectsPage, ProjectDetailPage, AllTasksPage,
                              BoardPage(+Picker), GanttPage(+Picker), CalendarPage, TimelinePage,
                              WorkloadPage, TimesheetsPage — Phase 4,
                              DashboardPage — lazy-loaded, see App.tsx,
                              RisksPage, AiSettingsPage, AskPage — Phase 5)
                              -- Phase 6 has no new pages: the notification bell and Cmd/Ctrl+K search
                                 are global overlays mounted in AppShell, not routes.
                              -- Phase 7 has no new pages either: templates and import/export are new
                                 dialogs/sections on ProjectsPage and ProjectDetailPage, not new routes.
```

## Design decisions and trade-offs

Intentional choices, worth revisiting only if a later phase's needs
change the calculus:

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
- Project templates (Phase 7) capture task statuses, project-scoped custom
  fields, and tasks only — task dependencies, subtasks, milestones, and
  recurrence rules aren't part of a template snapshot, so a materialized
  project never has any of those even if the source project did. Revisit
  only if a real workflow needs one of these to travel with a template.
- JSON export/import (Phase 7) deliberately excludes attachments (binary
  blobs), comments/the field-change audit log, automation rules/run log,
  and time/budget data — it targets exactly what the brief's acceptance
  criteria named (tasks, custom fields, dependencies) plus the structural
  data needed to make those meaningful, not a full-fidelity database dump.
  A single-project export also drops any dependency edge whose other end
  points outside that project (cross-project dependencies survive an
  "export everything" round-trip, just not a single-project one). See
  AGENTS.md for the complete scope list.
- CSV task import/export (Phase 7) round-trips through the same "blank
  assignee displays as the literal text 'Unassigned'" convention the CSV
  exporter already used before this phase — re-importing an export with an
  unassigned task sets that task's `assignee` to the string `"Unassigned"`,
  not an empty string. See AGENTS.md's CSV sharp edge for why this isn't
  special-cased away.
- The RBAC scaffolding (Phase 7) is exactly that — scaffolding. There is no
  login, no session, no server, and `useCurrentRole()` always returns
  `"owner"`. A deliberately small set of real call sites (project/task
  delete, template save/apply, import) already call `hasPermission()`, but
  every check passes today by construction. Treat this as the seam a real
  auth phase would replace, not as working access control.
