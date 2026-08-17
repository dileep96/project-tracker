import type { AiProviderConfig, Project, Task, TaskStatus } from "@/lib/db";
import { chatCompletion, type ChatMessage } from "@/lib/ai/client";
import { startOfDay } from "@/lib/analytics/date-buckets";

const RECENT_ACTIVITY_WINDOW_DAYS = 14;
const RECENT_ACTIVITY_MAX_ITEMS = 20;
const OVERDUE_MAX_ITEMS = 25;

export interface ProjectSummaryContext {
  project: { name: string; description: string; status: string; health: string; budgetEstimate: number | null };
  totalTasks: number;
  completedTasks: number;
  statusBreakdown: { name: string; count: number }[];
  overdue: { title: string; daysOverdue: number; assignee: string; priority: string }[];
  recentActivity: { title: string; event: "created" | "completed"; at: number }[];
}

/** Pulled directly from live task data (`tasks`/`statuses`) — nothing here is invented; the model only ever sees what's built here. */
export function buildProjectSummaryContext(project: Project, tasks: Task[], statuses: TaskStatus[]): ProjectSummaryContext {
  const today = startOfDay(Date.now());
  const activityWindowStart = today - RECENT_ACTIVITY_WINDOW_DAYS * 86_400_000;
  const statusNameById = Object.fromEntries(statuses.map((s) => [s.id, s.name]));

  const statusCounts = new Map<string, number>();
  for (const t of tasks) {
    const name = statusNameById[t.statusId] ?? "Unknown";
    statusCounts.set(name, (statusCounts.get(name) ?? 0) + 1);
  }

  const overdue = tasks
    .filter((t) => t.completedAt === null && t.dueDate !== null && t.dueDate < today)
    .sort((a, b) => a.dueDate! - b.dueDate!)
    .slice(0, OVERDUE_MAX_ITEMS)
    .map((t) => ({
      title: t.title,
      daysOverdue: Math.max(1, Math.round((today - t.dueDate!) / 86_400_000)),
      assignee: t.assignee || "Unassigned",
      priority: t.priority,
    }));

  const recentActivity = tasks
    .flatMap((t) => {
      const events: { title: string; event: "created" | "completed"; at: number }[] = [];
      if (t.createdAt >= activityWindowStart) events.push({ title: t.title, event: "created", at: t.createdAt });
      if (t.completedAt !== null && t.completedAt >= activityWindowStart) events.push({ title: t.title, event: "completed", at: t.completedAt });
      return events;
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, RECENT_ACTIVITY_MAX_ITEMS);

  return {
    project: { name: project.name, description: project.description, status: project.status, health: project.health, budgetEstimate: project.budgetEstimate },
    totalTasks: tasks.length,
    completedTasks: tasks.filter((t) => t.completedAt !== null).length,
    statusBreakdown: Array.from(statusCounts.entries()).map(([name, count]) => ({ name, count })),
    overdue,
    recentActivity,
  };
}

const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

function renderContextAsText(ctx: ProjectSummaryContext): string {
  const lines: string[] = [];
  lines.push(`Project: ${ctx.project.name}`);
  if (ctx.project.description) lines.push(`Description: ${ctx.project.description}`);
  lines.push(`Status: ${ctx.project.status} | Health: ${ctx.project.health}`);
  if (ctx.project.budgetEstimate !== null) lines.push(`Budget estimate: $${ctx.project.budgetEstimate}`);
  lines.push(`Tasks: ${ctx.completedTasks}/${ctx.totalTasks} completed`);
  lines.push("");
  lines.push("Status breakdown:");
  for (const s of ctx.statusBreakdown) lines.push(`- ${s.name}: ${s.count}`);
  lines.push("");
  if (ctx.overdue.length > 0) {
    lines.push(`Overdue tasks (${ctx.overdue.length}):`);
    for (const t of ctx.overdue) lines.push(`- "${t.title}" — ${t.daysOverdue}d overdue, ${t.priority} priority, assignee: ${t.assignee}`);
  } else {
    lines.push("Overdue tasks: none");
  }
  lines.push("");
  if (ctx.recentActivity.length > 0) {
    lines.push(`Recent activity (last ${RECENT_ACTIVITY_WINDOW_DAYS} days):`);
    for (const a of ctx.recentActivity) lines.push(`- "${a.title}" ${a.event} on ${dateFmt.format(a.at)}`);
  } else {
    lines.push(`Recent activity (last ${RECENT_ACTIVITY_WINDOW_DAYS} days): none`);
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT =
  "You are a project status assistant for a personal project-tracking app. Write a concise, factual status summary (a short paragraph plus a bullet list of the most important risks or overdue items, if any) based ONLY on the data provided in the user message. Never invent tasks, people, dates, or numbers that aren't in that data. Plain text only, no markdown headers.";

export interface ProjectSummaryRequest {
  context: ProjectSummaryContext;
  messages: ChatMessage[];
}

/** Builds the exact request (context + rendered messages) without sending it — the caller keeps this around for the "what was sent" inspectable detail before/after the real call. */
export function buildProjectSummaryRequest(project: Project, tasks: Task[], statuses: TaskStatus[]): ProjectSummaryRequest {
  const context = buildProjectSummaryContext(project, tasks, statuses);
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: renderContextAsText(context) },
  ];
  return { context, messages };
}

export type GenerateSummaryResult = { ok: true; summary: string } | { ok: false; error: string };

export async function generateProjectSummary(config: AiProviderConfig, messages: ChatMessage[]): Promise<GenerateSummaryResult> {
  const result = await chatCompletion(config, messages, { temperature: 0.4 });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, summary: result.content.trim() };
}
