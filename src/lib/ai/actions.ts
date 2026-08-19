import { generateId } from "@/lib/ids";
import { TASK_PRIORITIES, type TaskPriority, type AiProviderConfig } from "@/lib/db";
import { chatCompletion, type ChatMessage, type ToolDef } from "@/lib/ai/client";
import { parseLocalDate } from "@/lib/ai/nl-query";
import { createTask } from "@/lib/queries/tasks";
import { createProject } from "@/lib/queries/projects";

/**
 * The AI Action Layer's write path — see the published plan's "propose, validate, confirm,
 * execute" shape. This file owns steps 2 and 3 (the model proposes a tool call; this file is the
 * *validator*, the one place that decides whether a proposal is even shown to the user). Nothing
 * in here ever writes to the database on its own — `interpretActionRequest` only ever returns
 * `ValidatedProposal[]`, and each proposal's `execute()` is what a human approving it in the UI
 * calls (`ActionProposalPanel`). Step 4 (confirm) lives entirely in the UI layer, deliberately not
 * here, so this module can never skip the human gate by construction.
 *
 * Phase B (this file's first version): additive actions only — create_task, create_project.
 * Nothing here can touch or remove an existing row. Phase C adds update_task/move_task; Phase D
 * adds delete_task with its own stronger UI confirmation. See the plan's §05 for the full staging
 * rationale — each phase is its own PR, reusing this same file and pattern.
 */

const isoDate = new Intl.DateTimeFormat("en-CA");

export interface ActionContext {
  projects: { id: string; name: string }[];
  statusesByProject: Record<string, { id: string; name: string; isDefault: boolean }[]>;
}

export interface ValidatedProposal {
  id: string;
  tool: string;
  /** Plain-language preview shown to the user — built by this app's own code from validated args, never the model's own phrasing. */
  summary: string;
  /** Only ever calls an existing, already-tested query function (createTask/createProject/...) — never a raw db write. */
  execute: () => Promise<void>;
}

export type ActionInterpretation =
  | { kind: "action"; proposals: ValidatedProposal[] }
  /** The model called a tool, but at least one call didn't validate against real data — shown to the user as-is rather than silently reinterpreted as a question. */
  | { kind: "rejected"; errors: string[] }
  /** The model didn't call any tool — the caller should fall back to the existing read-only /ask flow, unchanged. */
  | { kind: "no-action" }
  | { kind: "error"; error: string };

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

const CREATE_TASK_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "create_task",
    description: "Create a new task inside an existing project. Only call this when the user is clearly asking to add a new task that doesn't exist yet.",
    parameters: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "The name of an existing project to add the task to." },
        title: { type: "string", description: "The task's title." },
        description: { type: "string" },
        priority: { type: "string", enum: TASK_PRIORITIES },
        assignee: { type: "string" },
        dueDate: { type: "string", description: "YYYY-MM-DD, if the user gave a due date." },
        startDate: { type: "string", description: "YYYY-MM-DD, if the user gave a start date." },
      },
      required: ["projectName", "title"],
    },
  },
};

const CREATE_PROJECT_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "create_project",
    description: "Create a new, empty project. Only call this when the user is clearly asking to start a new project that doesn't exist yet.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The new project's name." },
        description: { type: "string" },
        owner: { type: "string" },
      },
      required: ["name"],
    },
  },
};

const ACTION_TOOLS: ToolDef[] = [CREATE_TASK_TOOL, CREATE_PROJECT_TOOL];

function buildActionSystemPrompt(context: ActionContext): string {
  const projectLines = context.projects.length > 0 ? context.projects.map((p) => `- "${p.name}"`).join("\n") : "(no projects exist yet)";
  return [
    "You help with a personal project-tracking app. You may call at most one of the tools you were given, but ONLY when the user is clearly, unambiguously asking to CREATE something brand new.",
    "If the user is asking a question, or asking to change, move, complete, or delete something that already exists, do NOT call any tool — just reply with the single word NONE and nothing else.",
    "Never call a tool for a vague request you're not confident about — replying NONE is always safe, a wrong tool call is not.",
    `Known existing projects:\n${projectLines}`,
    "For create_task, projectName should name one of the known existing projects above. If the user clearly means a project that isn't in that list, still call create_task with the name they used rather than guessing a different one — a validation step you don't see will handle a name that doesn't match.",
    "Any date must be in YYYY-MM-DD form.",
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Resolution helpers — never trust the model's raw text, always check it against real, live data.
// Mirrors nl-query.ts's coerceToReportFilters: a reference that doesn't cleanly resolve is
// rejected with a clear reason, never silently guessed at.
// ---------------------------------------------------------------------------

function resolveProjectByName(rawName: unknown, context: ActionContext): { id: string; name: string } | { error: string } {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) return { error: "No project name was given." };
  const lower = name.toLowerCase();
  const exact = context.projects.find((p) => p.name.toLowerCase() === lower);
  if (exact) return exact;
  const partial = context.projects.filter((p) => p.name.toLowerCase().includes(lower));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) return { error: `"${name}" matches more than one project (${partial.map((p) => p.name).join(", ")}) — say which one.` };
  return { error: `No project matches "${name}".` };
}

function defaultStatusId(projectId: string, context: ActionContext): string | null {
  const statuses = context.statusesByProject[projectId] ?? [];
  return statuses.find((s) => s.isDefault)?.id ?? statuses[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Validators — one per tool. Each turns raw (untrusted) tool-call arguments into either a
// ValidatedProposal ready to show the user, or a plain-English reason it was rejected.
// ---------------------------------------------------------------------------

type Validator = (args: Record<string, unknown>, context: ActionContext) => ValidatedProposal | { error: string };

function readString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

const validateCreateTask: Validator = (args, context) => {
  const title = readString(args, "title");
  if (!title) return { error: "The AI didn't give a task title." };
  const project = resolveProjectByName(args.projectName, context);
  if ("error" in project) return project;
  const statusId = defaultStatusId(project.id, context);
  if (!statusId) return { error: `Project "${project.name}" has no statuses yet, so a new task has nowhere to go.` };
  const priority = TASK_PRIORITIES.includes(args.priority as TaskPriority) ? (args.priority as TaskPriority) : undefined;
  const dueDate = parseLocalDate(args.dueDate);
  const startDate = parseLocalDate(args.startDate);
  const assignee = readString(args, "assignee");
  const description = readString(args, "description");

  const parts = [`Create task "${title}" in ${project.name}`];
  if (priority) parts.push(`${priority} priority`);
  if (assignee) parts.push(`assigned to ${assignee}`);
  if (dueDate !== null) parts.push(`due ${isoDate.format(dueDate)}`);

  return {
    id: generateId(),
    tool: "create_task",
    summary: parts.join(" · "),
    execute: async () => {
      await createTask({ projectId: project.id, statusId, title, description, priority, assignee, dueDate, startDate });
    },
  };
};

const validateCreateProject: Validator = (args) => {
  const name = readString(args, "name");
  if (!name) return { error: "The AI didn't give a project name." };
  const description = readString(args, "description");
  const owner = readString(args, "owner");

  return {
    id: generateId(),
    tool: "create_project",
    summary: `Create a new project named "${name}"${description ? ` — ${description}` : ""}`,
    execute: async () => {
      await createProject({ name, description, owner });
    },
  };
};

const VALIDATORS: Record<string, Validator> = {
  create_task: validateCreateTask,
  create_project: validateCreateProject,
};

// ---------------------------------------------------------------------------

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * The classification + validation step of "propose, validate, confirm, execute". Runs one
 * tool-calling request; if the model didn't call anything, the caller falls back to the existing
 * read-only /ask flow unchanged — this function never affects behavior for a plain question.
 */
export async function interpretActionRequest(config: AiProviderConfig, question: string, context: ActionContext): Promise<ActionInterpretation> {
  const messages: ChatMessage[] = [
    { role: "system", content: buildActionSystemPrompt(context) },
    { role: "user", content: question },
  ];
  const result = await chatCompletion(config, messages, { temperature: 0, tools: ACTION_TOOLS });
  if (!result.ok) return { kind: "error", error: result.error };
  if (!result.toolCalls || result.toolCalls.length === 0) return { kind: "no-action" };

  const proposals: ValidatedProposal[] = [];
  const errors: string[] = [];
  for (const call of result.toolCalls) {
    const validator = VALIDATORS[call.function.name];
    if (!validator) {
      errors.push(`The AI tried to use an action ("${call.function.name}") that doesn't exist.`);
      continue;
    }
    const validated = validator(parseArgs(call.function.arguments), context);
    if ("error" in validated) errors.push(validated.error);
    else proposals.push(validated);
  }

  if (proposals.length === 0) return { kind: "rejected", errors };
  return { kind: "action", proposals };
}
