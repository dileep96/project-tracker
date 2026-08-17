import type { Milestone, Person, Project, Task, TaskDependency, TimeEntry } from "@/lib/db";
import { normalizeDependencyEdges } from "@/lib/dependency-graph";
import { computeProjectBudget, budgetStatus } from "@/lib/analytics/budget";
import { formatCurrency } from "@/lib/format";
import { DAY_MS, startOfDay } from "@/lib/analytics/date-buckets";

export type RiskSeverity = "high" | "medium" | "low";
export type RiskKind = "overdue-dependency" | "budget-overrun" | "milestone";

export interface RiskItem {
  id: string;
  kind: RiskKind;
  severity: RiskSeverity;
  projectId: string;
  projectName: string;
  title: string;
  detail: string;
  /** Present when this risk should link straight to a task (opens TaskDetailSheet). */
  taskId?: string;
  /** Present for milestone risks — no task-level drill-down, the project is the link target. */
  milestoneId?: string;
  /** When this became a risk — overdue-since date, milestone target date, or "now" for budget — used to sort within a severity tier. */
  sortDate: number;
}

const MILESTONE_APPROACHING_WINDOW_DAYS = 7;

function daysAgo(pastEpochMs: number, nowEpochMs: number): number {
  return Math.max(1, Math.round((startOfDay(nowEpochMs) - startOfDay(pastEpochMs)) / DAY_MS));
}

/**
 * Overdue task dependencies: a predecessor that's overdue and incomplete, still blocking a
 * successor that hasn't finished either. Reuses the same edge normalization the Gantt
 * critical-path pass builds on (`normalizeDependencyEdges`) rather than re-deriving predecessor/
 * successor from `TaskDependency.type` here. Severity is "high" once the successor has *also*
 * slipped past its own due date (the block has already caused real lateness), "medium" while the
 * successor is merely at risk of it (not yet due, or has no due date of its own).
 */
export function computeOverdueDependencyRisks(
  tasks: Task[],
  dependencies: TaskDependency[],
  projectsById: Record<string, Project>,
  now: number
): RiskItem[] {
  const tasksById = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const edges = normalizeDependencyEdges(dependencies);
  const today = startOfDay(now);
  const risks: RiskItem[] = [];

  for (const edge of edges) {
    const predecessor = tasksById[edge.predecessorId];
    const successor = tasksById[edge.successorId];
    if (!predecessor || !successor) continue; // stale edge pointing at a deleted task
    if (predecessor.completedAt !== null || predecessor.dueDate === null || predecessor.dueDate >= today) continue;
    if (successor.completedAt !== null) continue; // the successor already finished despite the block

    const successorAlsoOverdue = successor.dueDate !== null && successor.dueDate < today;
    const project = projectsById[successor.projectId];
    risks.push({
      id: `overdue-dependency:${edge.dependencyId}`,
      kind: "overdue-dependency",
      severity: successorAlsoOverdue ? "high" : "medium",
      projectId: successor.projectId,
      projectName: project?.name ?? "—",
      title: `"${predecessor.title}" is blocking "${successor.title}"`,
      detail: `Blocking task is ${daysAgo(predecessor.dueDate, now)} day${daysAgo(predecessor.dueDate, now) === 1 ? "" : "s"} overdue${successorAlsoOverdue ? " — the blocked task has also passed its own due date" : ""}.`,
      taskId: successor.id,
      sortDate: predecessor.dueDate,
    });
  }
  return risks;
}

/**
 * Budget overruns: reuses `computeProjectBudget`/`budgetStatus` from Phase 4 verbatim — actual
 * cost is always logged time × the logging person's hourly rate, unchanged here. "over" is the
 * real overrun (high); "near" (>=85%) is surfaced as a lower-severity heads-up so the register
 * catches a budget about to break, not only ones that already have.
 */
export function computeBudgetRisks(projects: Project[], tasks: Task[], timeEntries: TimeEntry[], people: Person[]): RiskItem[] {
  const risks: RiskItem[] = [];
  for (const project of projects) {
    if (project.budgetEstimate === null || project.budgetEstimate <= 0) continue;
    const budget = computeProjectBudget(project, tasks, timeEntries, people);
    const status = budgetStatus(project.budgetEstimate, budget.actualCost);
    if (status !== "over" && status !== "near") continue;
    const over = status === "over";
    const delta = Math.abs(project.budgetEstimate - budget.actualCost);
    const pct = Math.round((budget.actualCost / project.budgetEstimate) * 100);
    risks.push({
      id: `budget-overrun:${project.id}`,
      kind: "budget-overrun",
      severity: over ? "high" : "medium",
      projectId: project.id,
      projectName: project.name,
      title: over ? `${project.name} is over budget` : `${project.name} is approaching its budget`,
      detail: `${formatCurrency(budget.actualCost)} spent of ${formatCurrency(project.budgetEstimate)} (${pct}%)${over ? ` — ${formatCurrency(delta)} over` : ` — ${formatCurrency(delta)} remaining`}.`,
      sortDate: Date.now(),
    });
  }
  return risks;
}

/**
 * Milestone risk: user-marked "at-risk"/"missed" statuses are surfaced as-is, plus two automatic
 * derivations for a milestone still sitting in "upcoming" — a target date already in the past reads
 * as an (undetected) miss, and one inside the approaching window is a heads-up before it's too
 * late to act. "completed" is never a risk.
 */
export function computeMilestoneRisks(milestones: Milestone[], projectsById: Record<string, Project>, now: number): RiskItem[] {
  const today = startOfDay(now);
  const risks: RiskItem[] = [];
  for (const m of milestones) {
    if (m.status === "completed") continue;
    const project = projectsById[m.projectId];
    const projectName = project?.name ?? "—";
    const overdue = m.targetDate < today;

    let severity: RiskSeverity;
    let title: string;
    let detail: string;
    if (m.status === "missed" || (m.status === "upcoming" && overdue)) {
      severity = "high";
      title = `"${m.name}" missed its target date`;
      detail = `Target date was ${daysAgo(m.targetDate, now)} day${daysAgo(m.targetDate, now) === 1 ? "" : "s"} ago.`;
    } else if (m.status === "at-risk") {
      severity = "medium";
      title = `"${m.name}" is flagged at risk`;
      detail = overdue
        ? `Target date has passed and it's still marked at risk.`
        : `Target date is ${daysAgo(now, m.targetDate)} day${daysAgo(now, m.targetDate) === 1 ? "" : "s"} away.`;
    } else if (m.targetDate - today <= MILESTONE_APPROACHING_WINDOW_DAYS * DAY_MS) {
      severity = "low";
      title = `"${m.name}" is approaching`;
      detail = `Target date is ${daysAgo(now, m.targetDate)} day${daysAgo(now, m.targetDate) === 1 ? "" : "s"} away.`;
    } else {
      continue; // upcoming, not close enough yet — not a risk
    }

    risks.push({
      id: `milestone:${m.id}`,
      kind: "milestone",
      severity,
      projectId: m.projectId,
      projectName,
      title,
      detail,
      milestoneId: m.id,
      sortDate: m.targetDate,
    });
  }
  return risks;
}

const SEVERITY_RANK: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Combines every risk source and sorts severity-first (high → low), most-recent-cause first within a tier. */
export function computeRiskRegister(
  tasks: Task[],
  dependencies: TaskDependency[],
  projects: Project[],
  milestones: Milestone[],
  timeEntries: TimeEntry[],
  people: Person[],
  now: number
): RiskItem[] {
  const projectsById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const all = [
    ...computeOverdueDependencyRisks(tasks, dependencies, projectsById, now),
    ...computeBudgetRisks(projects, tasks, timeEntries, people),
    ...computeMilestoneRisks(milestones, projectsById, now),
  ];
  return all.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.sortDate - a.sortDate);
}
