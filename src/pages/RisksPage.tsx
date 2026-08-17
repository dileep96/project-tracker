import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, CurrencyDollar, Flag, LinkBreak } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { useAllTasks } from "@/hooks/use-tasks";
import { useProjects } from "@/hooks/use-projects";
import { useAllDependencies } from "@/hooks/use-task-detail";
import { useAllMilestones } from "@/hooks/use-milestones";
import { useAllTimeEntries } from "@/hooks/use-time-entries";
import { usePeople } from "@/hooks/use-people";
import { computeRiskRegister, type RiskItem, type RiskKind, type RiskSeverity } from "@/lib/analytics/risks";
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG: Record<RiskSeverity, { label: string; badge: string }> = {
  // "low" deliberately isn't green — every row on this page is a risk, and green reads as "fine"
  // everywhere else in this app (HealthBadge, budget status). A muted badge keeps that signal honest.
  high: { label: "High", badge: "bg-health-red-bg text-health-red-fg" },
  medium: { label: "Medium", badge: "bg-health-amber-bg text-health-amber-fg" },
  low: { label: "Low", badge: "bg-muted text-muted-foreground" },
};

const KIND_CONFIG: Record<RiskKind, { label: string; icon: typeof LinkBreak }> = {
  "overdue-dependency": { label: "Overdue dependency", icon: LinkBreak },
  "budget-overrun": { label: "Budget", icon: CurrencyDollar },
  milestone: { label: "Milestone", icon: Flag },
};

function SeverityBadge({ severity }: { severity: RiskSeverity }) {
  const config = SEVERITY_CONFIG[severity];
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", config.badge)}>{config.label}</span>;
}

export function RisksPage() {
  const tasks = useAllTasks();
  const projects = useProjects();
  const dependencies = useAllDependencies();
  const milestones = useAllMilestones();
  const timeEntries = useAllTimeEntries();
  const people = usePeople();
  const navigate = useNavigate();

  const [severityFilter, setSeverityFilter] = useState<RiskSeverity | "all">("all");
  const [kindFilter, setKindFilter] = useState<RiskKind | "all">("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const loading =
    tasks === undefined || projects === undefined || dependencies === undefined || milestones === undefined || timeEntries === undefined || people === undefined;

  const risks = useMemo(() => {
    if (loading) return [];
    return computeRiskRegister(tasks!, dependencies!, projects!, milestones!, timeEntries!, people!, Date.now());
  }, [loading, tasks, dependencies, projects, milestones, timeEntries, people]);

  const counts = useMemo(
    () => ({
      high: risks.filter((r) => r.severity === "high").length,
      medium: risks.filter((r) => r.severity === "medium").length,
      low: risks.filter((r) => r.severity === "low").length,
    }),
    [risks]
  );

  const filtered = risks.filter(
    (r) =>
      (severityFilter === "all" || r.severity === severityFilter) &&
      (kindFilter === "all" || r.kind === kindFilter) &&
      (projectFilter === "all" || r.projectId === projectFilter)
  );

  function openRisk(risk: RiskItem) {
    if (risk.taskId) setOpenTaskId(risk.taskId);
    else navigate(`/projects/${risk.projectId}`);
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Risks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overdue task dependencies, budget overruns, and approaching or missed milestones across every project.
        </p>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : risks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <CheckCircle className="size-6 text-health-green-fg" />
          <p className="text-sm font-medium">No risks detected</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Every dependency is on track, every budgeted project is under budget, and every milestone is on schedule.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {(["high", "medium", "low"] as RiskSeverity[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverityFilter((f) => (f === s ? "all" : s))}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-lg border px-4 py-3 text-left transition-colors",
                  severityFilter === s ? "border-ring bg-muted" : "border-border hover:bg-muted/50"
                )}
              >
                <span className="text-xs text-muted-foreground">{SEVERITY_CONFIG[s].label} severity</span>
                <span className="font-mono text-xl font-semibold tabular-nums">{counts[s]}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as RiskKind | "all")}>
              <SelectTrigger size="sm" className="h-8 w-48 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risk types</SelectItem>
                {(Object.keys(KIND_CONFIG) as RiskKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_CONFIG[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger size="sm" className="h-8 w-48 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects!.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(severityFilter !== "all" || kindFilter !== "all" || projectFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  setSeverityFilter("all");
                  setKindFilter("all");
                  setProjectFilter("all");
                }}
              >
                Reset
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} of {risks.length}
            </span>
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              No risks match these filters.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((risk) => {
                const Icon = KIND_CONFIG[risk.kind].icon;
                return (
                  <button
                    key={risk.id}
                    type="button"
                    onClick={() => openRisk(risk)}
                    className="flex items-start gap-3 rounded-lg border border-border p-3.5 text-left transition-colors hover:bg-muted/50"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{risk.title}</span>
                        <SeverityBadge severity={risk.severity} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{risk.detail}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{risk.projectName}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  );
}
