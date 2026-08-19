import { generateId } from "@/lib/ids";
import { TASK_PRIORITIES, type Task, type TaskPriority, type AiProviderConfig } from "@/lib/db";
import { chatCompletion, type ChatMessage, type ToolDef } from "@/lib/ai/client";
import { parseLocalDate } from "@/lib/ai/nl-query";
import { createTask, updateTask } from "@/lib/queries/tasks";
import { createProject } from "@/lib/queries/projects";
import { moveTasksToProject } from "@/lib/queries/move-tasks";

/**
 * The AI Action Layer's write path — see the published plan's "propose, validate, confirm,
 * execute" shape. This file owns steps 2 and 3 (the model proposes a tool call; this file is the
 * *validator*, the one place that decides whether a proposal is even shown to the user). Nothing
 * in here ever writes to the database on its own — `interpretActionRequest` only ever returns
 * `ValidatedProposal[]`, and each proposal's `execute()` is what a human approving it in the UI
 * calls (`ActionProposalPanel`). Step 4 (confirm) lives entirely in the UI layer, deliberately not
 * here, so this module can never skip the human gate by construction.
 *
 * Phase B added additive actions only — create_task, create_project. Phase C (this version) adds
 * update_task/move_task: now touching a row that already exists, so every proposal also carries a
 * before -> after diff, the same field-change language the Activity tab already renders, so the
 * preview says exactly what's about to change rather than just "the task will be updated." Phase D
 * adds delete_task with its own stronger UI confirmation. See the plan's §05 for the full staging
 * rationale — each phase is its own PR, reusing this same file and pattern.
 *
 * update_task/move_task never trust a task id from the model (it doesn't know real ids) — they
 * take a `taskTitle` the model just copies from the user's own wording, resolved against the live
 * task list in `resolveTaskByTitle` below. An ambiguous or unmatched title is rejected with a
 * clear reason, the same "never silently guess" rule every other resolver in this file follows.
 */

const isoDate = new Intl.DateTimeFormat("en-CA");

export interface ActionContext {
  projects: { id: string; name: string }[];
  statusesByProject: Record<string, { id: string; name: string; isDefault: boolean }[]>;
  tasks: { id: string; title: string; projectId: string; projectName: string; priority: TaskPriority; statusId: string; statusName: string; assignee: string; dueDate: number | null; startDate: number | null }[];
}

export interface ProposalDiffLine {
  field: string;
  before: string;
  after: string;
}

export interface ValidatedProposal {
  id: string;
  tool: string;
  /** Plain-language preview shown to the user — built by this app's own code from validated args, never the model's own phrasing. */
  summary: string;
  /** Present for edits to an existing row (update_task/move_task) — the exact before -> after values, not just a description of the change. */
  diff?: ProposalDiffLine[];
  /** Only ever calls an existing, already-tested query function (createTask/createProject/updateTask/moveTasksToProject/...) — never a raw db write. */
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

const UPDATE_TASK_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "update_task",
    description:
      "Change one or more fields of an existing task — title, priority, status, assignee, start date, or due date. Only call this when the user is clearly asking to change a task that already exists, and only set the fields they actually asked to change.",
    parameters: {
      type: "object",
      properties: {
        taskTitle: { type: "string", description: "The existing task's title, as the user phrased it." },
        projectName: { type: "string", description: "The task's project, if the user mentioned it — helps disambiguate a title that could match more than one task." },
        newTitle: { type: "string", description: "Only if the user asked to rename the task." },
        priority: { type: "string", enum: TASK_PRIORITIES },
        statusName: { type: "string", description: "An existing status in the task's own project, e.g. \"In Progress\"." },
        assignee: { type: "string" },
        dueDate: { type: "string", description: "YYYY-MM-DD" },
        startDate: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["taskTitle"],
    },
  },
};

const MOVE_TASK_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "move_task",
    description: "Move an existing task to a different project. Only call this when the user clearly asks to move a task.",
    parameters: {
      type: "object",
      properties: {
        taskTitle: { type: "string", description: "The existing task's title, as the user phrased it." },
        currentProjectName: { type: "string", description: "The task's current project, if the user mentioned it — helps disambiguate a title that could match more than one task." },
        targetProjectName: { type: "string", description: "The project to move the task into." },
      },
      required: ["taskTitle", "targetProjectName"],
    },
  },
};

const ACTION_TOOLS: ToolDef[] = [CREATE_TASK_TOOL, CREATE_PROJECT_TOOL, UPDATE_TASK_TOOL, MOVE_TASK_TOOL];

function buildActionSystemPrompt(context: ActionContext): string {
  const projectLines = context.projects.length > 0 ? context.projects.map((p) => `- "${p.name}"`).join("\n") : "(no projects exist yet)";
  return [
    "You help with a personal project-tracking app. You may call at most one of the tools you were given, but ONLY when the user is clearly, unambiguously asking to create, change, or move something that already exists or should exist — never for a plain question.",
    "If the user is only asking a question, or asking to delete something, do NOT call any tool — just reply with the single word NONE and nothing else.",
    "Never call a tool for a vague request you're not confident about — replying NONE is always safe, a wrong tool call is not.",
    `Known existing projects:\n${projectLines}`,
    "When a tool takes a project name, use one of the known existing projects above if the user's wording is close to it, rather than inventing a different name — a validation step you don't see will catch a name that doesn't match.",
    "For update_task or move_task, use the task's title exactly as the user phrased it — you don't need to know the full task list, a later step resolves it against real data. Only set a field on update_task the user actually asked to change; never invent a value for priority, status, assignee, or a date.",
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

type ActionTask = ActionContext["tasks"][number];

/**
 * Resolves a task the model referenced only by title text (never a real id — see this file's
 * top-of-file doc comment) against the live task list. Tries an exact title match first, falls
 * back to a substring match, and — only when more than one task is still ambiguous — narrows by
 * the caller's project hint. Anything still ambiguous or unmatched is rejected outright rather
 * than picking one silently, same as resolveProjectByName above.
 */
function resolveTaskByTitle(rawTitle: unknown, rawProjectHint: unknown, context: ActionContext): ActionTask | { error: string } {
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (!title) return { error: "No task title was given." };
  const lower = title.toLowerCase();

  let candidates = context.tasks.filter((t) => t.title.toLowerCase() === lower);
  if (candidates.length === 0) candidates = context.tasks.filter((t) => t.title.toLowerCase().includes(lower));

  const hint = typeof rawProjectHint === "string" ? rawProjectHint.trim().toLowerCase() : "";
  if (hint && candidates.length > 1) {
    const narrowed = candidates.filter((t) => t.projectName.toLowerCase().includes(hint));
    if (narrowed.length > 0) candidates = narrowed;
  }

  if (candidates.length === 0) return { error: `No task matches "${title}".` };
  if (candidates.length > 1) {
    return { error: `"${title}" matches more than one task (${candidates.map((t) => `"${t.title}" in ${t.projectName}`).join(", ")}) — say which project.` };
  }
  return candidates[0];
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

const validateUpdateTask: Validator = (args, context) => {
  const task = resolveTaskByTitle(args.taskTitle, args.projectName, context);
  if ("error" in task) return task;

  const patch: Partial<Omit<Task, "id" | "createdAt">> = {};
  const diff: ProposalDiffLine[] = [];

  const newTitle = readString(args, "newTitle");
  if (newTitle && newTitle !== task.title) {
    patch.title = newTitle;
    diff.push({ field: "Title", before: task.title, after: newTitle });
  }

  if (TASK_PRIORITIES.includes(args.priority as TaskPriority) && args.priority !== task.priority) {
    patch.priority = args.priority as TaskPriority;
    diff.push({ field: "Priority", before: task.priority, after: args.priority as string });
  }

  const statusNameArg = readString(args, "statusName");
  if (statusNameArg) {
    const status = (context.statusesByProject[task.projectId] ?? []).find((s) => s.name.toLowerCase() === statusNameArg.toLowerCase());
    if (!status) return { error: `"${statusNameArg}" isn't a status in ${task.projectName}.` };
    if (status.id !== task.statusId) {
      patch.statusId = status.id;
      diff.push({ field: "Status", before: task.statusName, after: status.name });
    }
  }

  if (typeof args.assignee === "string" && args.assignee.trim() !== task.assignee) {
    const assignee = args.assignee.trim();
    patch.assignee = assignee;
    diff.push({ field: "Assignee", before: task.assignee || "(none)", after: assignee || "(none)" });
  }

  if (typeof args.dueDate === "string") {
    const dueDate = parseLocalDate(args.dueDate);
    if (dueDate !== task.dueDate) {
      patch.dueDate = dueDate;
      diff.push({ field: "Due date", before: task.dueDate !== null ? isoDate.format(task.dueDate) : "(none)", after: dueDate !== null ? isoDate.format(dueDate) : "(none)" });
    }
  }
  if (typeof args.startDate === "string") {
    const startDate = parseLocalDate(args.startDate);
    if (startDate !== task.startDate) {
      patch.startDate = startDate;
      diff.push({ field: "Start date", before: task.startDate !== null ? isoDate.format(task.startDate) : "(none)", after: startDate !== null ? isoDate.format(startDate) : "(none)" });
    }
  }

  if (diff.length === 0) return { error: `The AI didn't specify any actual change to "${task.title}".` };

  return {
    id: generateId(),
    tool: "update_task",
    summary: `Update "${task.title}" in ${task.projectName}`,
    diff,
    execute: async () => {
      await updateTask(task.id, patch);
    },
  };
};

const validateMoveTask: Validator = (args, context) => {
  const task = resolveTaskByTitle(args.taskTitle, args.currentProjectName, context);
  if ("error" in task) return task;
  const target = resolveProjectByName(args.targetProjectName, context);
  if ("error" in target) return target;
  if (target.id === task.projectId) return { error: `"${task.title}" is already in ${target.name}.` };

  return {
    id: generateId(),
    tool: "move_task",
    summary: `Move "${task.title}" from ${task.projectName} to ${target.name}`,
    diff: [{ field: "Project", before: task.projectName, after: target.name }],
    execute: async () => {
      const result = await moveTasksToProject([task.id], target.id);
      if (result.moved.length === 0) throw new Error("The move didn't go through — the task may already be somewhere else.");
    },
  };
};

const VALIDATORS: Record<string, Validator> = {
  create_task: validateCreateTask,
  create_project: validateCreateProject,
  update_task: validateUpdateTask,
  move_task: validateMoveTask,
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
