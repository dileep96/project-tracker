import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { ProjectDetailPage } from "@/pages/ProjectDetailPage";
import { AllTasksPage } from "@/pages/AllTasksPage";
import { BoardPickerPage } from "@/pages/BoardPickerPage";
import { BoardPage } from "@/pages/BoardPage";
import { GanttPickerPage } from "@/pages/GanttPickerPage";
import { GanttPage } from "@/pages/GanttPage";
import { CalendarPage } from "@/pages/CalendarPage";
import { TimelinePage } from "@/pages/TimelinePage";
import { WorkloadPage } from "@/pages/WorkloadPage";
import { TimesheetsPage } from "@/pages/TimesheetsPage";
import { RisksPage } from "@/pages/RisksPage";
import { AiSettingsPage } from "@/pages/AiSettingsPage";
import { AskPage } from "@/pages/AskPage";
import { generateRecurringInstances } from "@/lib/recurrence";
import { runOverdueAutomationSweep } from "@/lib/queries/automations";

/** How often the "task became overdue" trigger re-scans while the app stays open — see AGENTS.md. Kept short since the sweep is cheap (a couple of Dexie table scans) at this app's personal-project scale. */
const OVERDUE_AUTOMATION_SWEEP_INTERVAL_MS = 60_000;

// Lazy-loaded: Recharts (plus its d3 dependencies) is the single heaviest import in the app —
// code-splitting it here keeps every other route's bundle the size it was before Phase 3 instead
// of every page paying for a chart library only /dashboard uses.
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));

const dashboardFallback = (
  <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="h-64 animate-pulse rounded-xl bg-muted" />
  </div>
);

export default function App() {
  // Bounded catch-up pass: fires once per app load so a recurring task's next occurrence exists
  // without the user having to open any particular view first. Calendar/Gantt also call this on
  // mount as a safety net for sessions left open across the lookahead window — see
  // src/lib/recurrence.ts and README's "Recurring task generation" section for the full picture.
  useEffect(() => {
    generateRecurringInstances().catch((error) => console.error("Recurring task generation failed", error));
  }, []);

  // "Task became overdue" automations have no natural write-time hook (nothing writes to a task
  // the moment its due date passes) — the same trade-off recurring-task generation makes, run on
  // an interval instead. runOverdueAutomationSweep() never throws (see automations.ts) and
  // self-dedupes against the run log, so re-running it constantly is safe and cheap.
  useEffect(() => {
    runOverdueAutomationSweep();
    const id = window.setInterval(runOverdueAutomationSweep, OVERDUE_AUTOMATION_SWEEP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/tasks" element={<AllTasksPage />} />
        <Route path="/board" element={<BoardPickerPage />} />
        <Route path="/projects/:projectId/board" element={<BoardPage />} />
        <Route path="/gantt" element={<GanttPickerPage />} />
        <Route path="/projects/:projectId/gantt" element={<GanttPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/projects/:projectId/calendar" element={<CalendarPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/workload" element={<WorkloadPage />} />
        <Route path="/timesheets" element={<TimesheetsPage />} />
        <Route path="/risks" element={<RisksPage />} />
        <Route path="/ask" element={<AskPage />} />
        <Route path="/settings/ai" element={<AiSettingsPage />} />
        <Route
          path="/dashboard"
          element={
            <Suspense fallback={dashboardFallback}>
              <DashboardPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Route>
    </Routes>
  );
}
