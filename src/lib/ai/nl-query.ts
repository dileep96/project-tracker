import type { AiProviderConfig, Project, ReportFilters, Task, TaskPriority } from "@/lib/db";
import { TASK_PRIORITIES } from "@/lib/db";
import { EMPTY_REPORT_FILTERS } from "@/lib/analytics/report";
import { chatCompletion, type ChatContentPart, type ChatMessage } from "@/lib/ai/client";
import type { ProcessedAttachment } from "@/lib/ai/attachments";

export interface NlQueryContext {
  projects: { id: string; name: string }[];
  statusNames: string[];
  assignees: string[];
}

/** Every known project/status/assignee, from real live data — the closed sets the model's output gets validated against below, not guessed against blindly. */
export function buildNlQueryContext(projects: Project[], tasks: Task[], statusName: (task: Task) => string): NlQueryContext {
  return {
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    statusNames: Array.from(new Set(tasks.map(statusName))).filter(Boolean).sort(),
    assignees: Array.from(new Set(tasks.map((t) => t.assignee).filter(Boolean))).sort(),
  };
}

const isoDate = new Intl.DateTimeFormat("en-CA");

function buildSystemPrompt(context: NlQueryContext): string {
  const today = Date.now();
  const yesterday = today - 86_400_000;
  return [
    "You turn a natural-language question about tasks into a JSON filter object. This app applies the filter itself against real task data — you never see or report the actual results, only the filter.",
    "Respond with ONLY a single JSON object, no prose, no markdown code fences, matching exactly this shape (every key required, use null where the question gives no constraint):",
    `{
  "projectId": string | null,
  "statusName": string | null,
  "priority": "low" | "medium" | "high" | "urgent" | null,
  "assignee": string | null,
  "dateField": "dueDate" | "startDate" | "createdAt" | "completedAt",
  "dateFrom": "YYYY-MM-DD" | null,
  "dateTo": "YYYY-MM-DD" | null,
  "completed": true | false | null
}`,
    `Today's date is ${isoDate.format(today)}. Yesterday was ${isoDate.format(yesterday)}.`,
    `For "overdue" tasks specifically, use exactly: dateField "dueDate", dateTo "${isoDate.format(yesterday)}", dateFrom null, completed false. "Overdue" has no lower bound in time — do NOT invent a dateFrom for it, that would wrongly exclude tasks overdue by more than a day or two.`,
    `Known project ids and names: ${JSON.stringify(context.projects)}`,
    `Known status names (use exactly one of these or null): ${JSON.stringify(context.statusNames)}`,
    `Known assignees (for reference; "assignee" may also be a partial name): ${JSON.stringify(context.assignees)}`,
    "Only ever use a projectId from the list above, or null. Only ever use a statusName from the list above, or null. If the question doesn't mention a field, leave it null — never guess a value that isn't clearly implied.",
  ].join("\n\n");
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Some local models wrap JSON in a code fence or add a stray sentence despite instructions —
    // fall back to the first {...} block rather than failing the whole query over formatting.
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parseLocalDate(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
}

/**
 * Validates the model's raw JSON against the real, known project/status/priority sets — anything
 * that doesn't match a real value is dropped to "no constraint" rather than silently filtering to
 * an empty result set. This is the safety net: the model proposes intent, this function is what
 * turns it into a `ReportFilters` object `applyReportFilters` can trust (see AGENTS.md).
 */
export function coerceToReportFilters(raw: unknown, context: NlQueryContext): ReportFilters {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const projectId = typeof obj.projectId === "string" && context.projects.some((p) => p.id === obj.projectId) ? obj.projectId : null;
  const statusName = typeof obj.statusName === "string" && context.statusNames.includes(obj.statusName) ? obj.statusName : null;
  const priority = TASK_PRIORITIES.includes(obj.priority as TaskPriority) ? (obj.priority as TaskPriority) : null;
  const assignee = typeof obj.assignee === "string" && obj.assignee.trim() !== "" ? obj.assignee.trim() : null;
  const validDateFields = ["dueDate", "startDate", "createdAt", "completedAt"];
  const dateField = validDateFields.includes(obj.dateField as string) ? (obj.dateField as ReportFilters["dateField"]) : EMPTY_REPORT_FILTERS.dateField;
  const completed = typeof obj.completed === "boolean" ? obj.completed : null;
  return {
    projectId,
    statusName,
    priority,
    assignee,
    dateField,
    dateFrom: parseLocalDate(obj.dateFrom),
    dateTo: parseLocalDate(obj.dateTo),
    completed,
  };
}

export interface NlQueryRequest {
  question: string;
  messages: ChatMessage[];
}

/**
 * When attachments are given, the user message becomes a multi-part `content` — the question's
 * own text, any PDF text appended after it (a PDF is just more text as far as the model's
 * concerned), and one `image_url` part per image. Text-only questions (no attachments, the common
 * case, and every call site before Phase A) keep the plain string `content` unchanged.
 */
export function buildNlQueryRequest(question: string, context: NlQueryContext, attachments: ProcessedAttachment[] = []): NlQueryRequest {
  const pdfText = attachments
    .filter((a) => a.kind === "text")
    .map((a) => `\n\n[Attached file "${a.name}"]\n${a.text}`)
    .join("");
  const images = attachments.filter((a) => a.kind === "image");

  const userContent: string | ChatContentPart[] =
    images.length === 0
      ? question + pdfText
      : [{ type: "text", text: question + pdfText }, ...images.map((img) => ({ type: "image_url" as const, image_url: { url: img.dataUrl } }))];

  return {
    question,
    messages: [
      { role: "system", content: buildSystemPrompt(context) },
      { role: "user", content: userContent },
    ],
  };
}

export type NlQueryResult = { ok: true; filters: ReportFilters; raw: string } | { ok: false; error: string; raw?: string };

export async function interpretNlQuery(config: AiProviderConfig, request: NlQueryRequest, context: NlQueryContext): Promise<NlQueryResult> {
  const result = await chatCompletion(config, request.messages, { temperature: 0 });
  if (!result.ok) return { ok: false, error: result.error };
  const parsed = extractJsonObject(result.content);
  if (parsed === null) return { ok: false, error: "The model's response wasn't valid JSON.", raw: result.content };
  return { ok: true, filters: coerceToReportFilters(parsed, context), raw: result.content };
}

/** A short, deterministic (never model-phrased) description of the applied filter — built by this app's own code, not trusted from the model's own words. */
export function describeFilters(filters: ReportFilters): string {
  const parts: string[] = [];
  if (filters.projectId) parts.push(`project`);
  if (filters.statusName) parts.push(`status "${filters.statusName}"`);
  if (filters.priority) parts.push(`${filters.priority} priority`);
  if (filters.assignee) parts.push(`assignee contains "${filters.assignee}"`);
  if (filters.completed === true) parts.push("completed");
  if (filters.completed === false) parts.push("not completed");
  if (filters.dateFrom !== null || filters.dateTo !== null) {
    const fieldLabel = { dueDate: "due", startDate: "starts", createdAt: "created", completedAt: "completed" }[filters.dateField];
    if (filters.dateFrom !== null && filters.dateTo !== null) parts.push(`${fieldLabel} ${isoDate.format(filters.dateFrom)}–${isoDate.format(filters.dateTo)}`);
    else if (filters.dateTo !== null) parts.push(`${fieldLabel} on or before ${isoDate.format(filters.dateTo)}`);
    else parts.push(`${fieldLabel} on or after ${isoDate.format(filters.dateFrom!)}`);
  }
  return parts.length === 0 ? "All tasks (no constraints matched)" : parts.join(" · ");
}
