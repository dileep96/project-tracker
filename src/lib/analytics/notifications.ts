/**
 * Notifications, computed live from real data every render — same "no separate storage table"
 * philosophy as the Phase 3 dashboard and Phase 5's risk register (`lib/analytics/risks.ts`).
 * Three sources: deadline reminders (derived here directly from `Task`), Phase 5's automation run
 * log (reused verbatim, not re-detected), and Phase 5's risk register (reused verbatim via
 * `computeRiskRegister` — this module never re-implements overdue-dependency/budget/milestone
 * detection). Read/unread state joins in from the `notificationReadState` ledger — see
 * `NotificationReadState`'s doc comment in `db.ts`.
 */
import type { AutomationRunLogEntry, NotificationReadState, Project, Task } from "@/lib/db";
import type { RiskItem, RiskSeverity } from "@/lib/analytics/risks";
import { DAY_MS, startOfDay } from "@/lib/analytics/date-buckets";

export type NotificationKind = "deadline" | "automation" | "risk";

/** A task due within this many days (inclusive) counts as "due soon", not yet overdue. */
export const DUE_SOON_WINDOW_DAYS = 3;

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  /** Reuses the risk register's high/medium/low severity language for a consistent visual weight across sources. */
  urgency: RiskSeverity;
  title: string;
  detail: string;
  /** When this notification's underlying event happened — due date, automation firing, or the risk's own `sortDate`. Drives feed ordering. */
  at: number;
  projectId: string;
  taskId?: string;
  read: boolean;
}

type UnreadNotificationItem = Omit<NotificationItem, "read">;

function daysBetween(a: number, b: number): number {
  return Math.round(Math.abs(a - b) / DAY_MS);
}

/**
 * Overdue and due-soon tasks. Deliberately independent of the risk register's own
 * `overdue-dependency` risk (a *blocked* task, not a task whose own due date has simply passed) —
 * this is the plain "your task is late" reminder every task deserves regardless of whether
 * anything depends on it.
 */
export function computeDeadlineNotifications(tasks: Task[], projectsById: Record<string, Project>, now: number): UnreadNotificationItem[] {
  const today = startOfDay(now);
  const items: UnreadNotificationItem[] = [];
  for (const task of tasks) {
    if (task.completedAt !== null || task.dueDate === null) continue;
    const dueDay = startOfDay(task.dueDate);
    const projectName = projectsById[task.projectId]?.name;
    if (dueDay < today) {
      const daysOverdue = daysBetween(today, dueDay);
      items.push({
        id: `deadline:${task.id}`,
        kind: "deadline",
        urgency: "high",
        title: `"${task.title}" is overdue`,
        detail: `Due ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} ago${projectName ? ` — ${projectName}` : ""}.`,
        at: task.dueDate,
        projectId: task.projectId,
        taskId: task.id,
      });
    } else if (dueDay - today <= DUE_SOON_WINDOW_DAYS * DAY_MS) {
      const daysUntil = daysBetween(dueDay, today);
      items.push({
        id: `deadline:${task.id}`,
        kind: "deadline",
        urgency: "medium",
        title: daysUntil === 0 ? `"${task.title}" is due today` : `"${task.title}" is due soon`,
        detail: `${daysUntil === 0 ? "Due today" : `Due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`}${projectName ? ` — ${projectName}` : ""}.`,
        at: task.dueDate,
        projectId: task.projectId,
        taskId: task.id,
      });
    }
  }
  return items;
}

/** One notification per automation firing — reuses the run log's own denormalized `ruleName`/`taskTitle`/`summary`, no re-derivation. */
export function computeAutomationNotifications(log: AutomationRunLogEntry[]): UnreadNotificationItem[] {
  return log.map((entry) => ({
    id: `automation:${entry.id}`,
    kind: "automation",
    urgency: "low",
    title: `Automation "${entry.ruleName}" ran`,
    detail: `${entry.taskTitle} — ${entry.summary}`,
    at: entry.firedAt,
    projectId: entry.projectId,
    taskId: entry.taskId,
  }));
}

/** One notification per active risk — reuses the risk register's own title/detail/severity verbatim. */
export function computeRiskNotifications(risks: RiskItem[]): UnreadNotificationItem[] {
  return risks.map((risk) => ({
    id: `risk:${risk.id}`,
    kind: "risk",
    urgency: risk.severity,
    title: risk.title,
    detail: risk.detail,
    at: risk.sortDate,
    projectId: risk.projectId,
    taskId: risk.taskId,
  }));
}

const URGENCY_RANK: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Combines every source, joins read-state, and sorts unread-first then urgency then recency — the order a bell panel should read top to bottom. */
export function computeNotifications(
  deadlineItems: UnreadNotificationItem[],
  automationItems: UnreadNotificationItem[],
  riskItems: UnreadNotificationItem[],
  readState: NotificationReadState[]
): NotificationItem[] {
  const readIds = new Set(readState.filter((r) => r.read).map((r) => r.id));
  const all = [...deadlineItems, ...automationItems, ...riskItems].map((item) => ({ ...item, read: readIds.has(item.id) }));
  return all.sort(
    (a, b) => Number(a.read) - Number(b.read) || URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || b.at - a.at
  );
}

export interface DigestSummary {
  periodLabel: string;
  periodStart: number;
  periodEnd: number;
  tasksCreated: number;
  tasksCompleted: number;
  /** Tasks whose due date fell inside this window, regardless of completion. */
  tasksDueInPeriod: number;
  /** Of those due in the window, how many are still incomplete and already past due as of `now` — the closest honest proxy for "became overdue this period" without a dedicated event log. */
  stillOverdue: number;
  commentsPosted: number;
  automationsRun: number;
  /** A snapshot of the risk register right now, not scoped to the period — risks aren't an event stream, so "new this period" isn't something this app can honestly claim without a risk-history table. */
  activeRisks: number;
}

/** A period summary (the "digest") — every count computed fresh from real data, the same live-recompute philosophy as the rest of this file. */
export function computeDigest(
  periodLabel: string,
  periodStart: number,
  periodEnd: number,
  tasks: Task[],
  commentsCreatedAt: number[],
  automationFiredAt: number[],
  activeRiskCount: number,
  now: number
): DigestSummary {
  const inWindow = (t: number) => t >= periodStart && t < periodEnd;
  const dueInPeriod = tasks.filter((t) => t.dueDate !== null && inWindow(t.dueDate));
  return {
    periodLabel,
    periodStart,
    periodEnd,
    tasksCreated: tasks.filter((t) => inWindow(t.createdAt)).length,
    tasksCompleted: tasks.filter((t) => t.completedAt !== null && inWindow(t.completedAt)).length,
    tasksDueInPeriod: dueInPeriod.length,
    stillOverdue: dueInPeriod.filter((t) => t.completedAt === null && t.dueDate! < now).length,
    commentsPosted: commentsCreatedAt.filter(inWindow).length,
    automationsRun: automationFiredAt.filter(inWindow).length,
    activeRisks: activeRiskCount,
  };
}
