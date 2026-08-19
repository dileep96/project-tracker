import type { AiProviderConfig, Task } from "@/lib/db";
import { chatCompletion, type ChatMessage } from "@/lib/ai/client";

const MAX_TASKS_IN_CONTEXT = 40;

export interface QueryResultTask {
  title: string;
  projectName: string;
  statusName: string;
  priority: string;
  dueDate: string | null;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

/** Built from the exact, already-filtered `Task[]` the table on screen is rendering — never from
 * the full database. This is the one thing that makes the written answer trustworthy: it can only
 * ever talk about rows the person can already see and verify for themselves. */
export function buildQueryResultRows(
  tasks: Task[],
  projectName: (task: Task) => string,
  statusName: (task: Task) => string
): QueryResultTask[] {
  return tasks.slice(0, MAX_TASKS_IN_CONTEXT).map((t) => ({
    title: t.title,
    projectName: projectName(t),
    statusName: statusName(t),
    priority: t.priority,
    dueDate: t.dueDate === null ? null : dateFmt.format(t.dueDate),
  }));
}

function renderRowsAsText(rows: QueryResultTask[], totalMatched: number): string {
  if (rows.length === 0) return "No tasks matched.";
  const lines = rows.map(
    (r) => `- "${r.title}" — ${r.projectName}, ${r.statusName}, ${r.priority} priority${r.dueDate ? `, due ${r.dueDate}` : ""}`
  );
  if (totalMatched > rows.length) lines.push(`...and ${totalMatched - rows.length} more not listed here.`);
  return lines.join("\n");
}

const SYSTEM_PROMPT =
  "You answer a question about a task list for a personal project-tracking app. Write 1-3 short, plain sentences, based ONLY on the task rows given in the user message — never invent a task, count, project, or date that isn't in that data. If no tasks matched, say so plainly rather than guessing why. Plain text only, no markdown, no bullet list (the matching tasks are already shown to the user in a table above your answer).";

export interface QueryAnswerRequest {
  messages: ChatMessage[];
}

/** Kept separate from the call itself (same split `summary.ts` uses) so the caller can show
 * exactly what was sent before/after asking — this app's own "never a black box" AI convention. */
export function buildQueryAnswerRequest(question: string, rows: QueryResultTask[], totalMatched: number): QueryAnswerRequest {
  // Same lesson nl-query.ts already learned the hard way (see its own system prompt): a model
  // asked to reason about "overdue"/"this week" without being told what today is will guess, and
  // guess wrong — hand it today's date explicitly rather than assuming it can infer one.
  const today = dateFmt.format(Date.now());
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Today is ${today}.\n\nQuestion: ${question}\n\nMatching tasks:\n${renderRowsAsText(rows, totalMatched)}` },
  ];
  return { messages };
}

export type QueryAnswerResult = { ok: true; answer: string } | { ok: false; error: string };

export async function generateQueryAnswer(config: AiProviderConfig, messages: ChatMessage[]): Promise<QueryAnswerResult> {
  const result = await chatCompletion(config, messages, { temperature: 0.3 });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, answer: result.content.trim() };
}
