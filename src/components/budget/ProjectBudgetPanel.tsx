import { useState } from "react";
import { Info } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Project, Task } from "@/lib/db";
import { useTimeEntriesForProject } from "@/hooks/use-time-entries";
import { usePeople } from "@/hooks/use-people";
import { computeProjectBudget, computeTaskBudget, budgetStatus, type BudgetStatus } from "@/lib/analytics/budget";
import { formatCurrency, formatHours } from "@/lib/format";
import { updateProject } from "@/lib/queries/projects";

const STATUS_TEXT: Record<BudgetStatus, string> = {
  unbudgeted: "text-muted-foreground",
  under: "text-health-green-fg",
  near: "text-health-amber-fg",
  over: "text-health-red-fg",
};
const STATUS_BAR: Record<BudgetStatus, string> = {
  unbudgeted: "bg-chart-seq-500",
  under: "bg-health-green-fg",
  near: "bg-health-amber-fg",
  over: "bg-health-red-fg",
};

/** Estimated-vs-actual for one project (Phase 4's "Budget tracking") plus a per-task breakdown. Actual cost is always logged time × the logging person's hourly rate — see AGENTS.md. */
export function ProjectBudgetPanel({ project, tasks }: { project: Project; tasks: Task[] }) {
  const timeEntries = useTimeEntriesForProject(project.id);
  const people = usePeople();
  const [estimateDraft, setEstimateDraft] = useState(project.budgetEstimate === null ? "" : String(project.budgetEstimate));

  if (timeEntries === undefined || people === undefined) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  }

  const budget = computeProjectBudget(project, tasks, timeEntries, people);
  const status = budgetStatus(project.budgetEstimate, budget.actualCost);
  const pct = project.budgetEstimate && project.budgetEstimate > 0 ? (budget.actualCost / project.budgetEstimate) * 100 : 0;
  const delta = project.budgetEstimate !== null ? project.budgetEstimate - budget.actualCost : null;

  const taskRows = tasks
    .map((task) => computeTaskBudget(task, timeEntries, people))
    .filter((row) => row.loggedHours > 0 || row.estimatedHours !== null)
    .sort((a, b) => b.actualCost - a.actualCost);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-budget-estimate">Budget estimate ($)</Label>
          <Input
            id="project-budget-estimate"
            type="number"
            min={0}
            step={100}
            value={estimateDraft}
            onChange={(e) => setEstimateDraft(e.target.value)}
            onBlur={() => {
              const value = estimateDraft === "" ? null : Math.max(0, Number(estimateDraft) || 0);
              if (value !== project.budgetEstimate) updateProject(project.id, { budgetEstimate: value });
            }}
            placeholder="No estimate set"
          />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Actual cost</p>
          <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums">{formatCurrency(budget.actualCost)}</p>
          <p className="font-mono text-xs text-muted-foreground">{formatHours(budget.loggedHours * 60)} logged</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{delta !== null && delta < 0 ? "Over budget by" : "Remaining"}</p>
          <p className={cn("mt-1.5 font-mono text-lg font-semibold tabular-nums", STATUS_TEXT[status])}>
            {delta === null ? "—" : formatCurrency(Math.abs(delta))}
          </p>
        </div>
      </div>

      {project.budgetEstimate !== null && project.budgetEstimate > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Budget spent</span>
            <span className={cn("font-mono font-medium tabular-nums", STATUS_TEXT[status])}>{Math.round(pct)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full transition-[width]", STATUS_BAR[status])} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </div>
      )}

      {budget.taskEstimateRollup > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Bottom-up estimate from task hours × assignee rate: {formatCurrency(budget.taskEstimateRollup)}
          {budget.unratedTaskCount > 0 &&
            ` (${budget.unratedTaskCount} task${budget.unratedTaskCount === 1 ? "" : "s"} excluded — no assignee rate to estimate from)`}
          .
        </p>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold">Per task</p>
        {taskRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tasks with estimated hours or logged time yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {taskRows.map((row) => (
              <div key={row.task.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-md border border-border px-3 py-2 text-xs">
                <span className="truncate font-medium">{row.task.title}</span>
                <span className="w-20 text-right font-mono text-muted-foreground">{row.estimatedHours !== null ? `${row.estimatedHours}h est.` : "—"}</span>
                <span className="w-20 text-right font-mono text-muted-foreground">{formatHours(row.loggedHours * 60)} logged</span>
                <span className="w-24 text-right font-mono font-medium tabular-nums">{formatCurrency(row.actualCost)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
