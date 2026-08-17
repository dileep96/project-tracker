import { db, type Comment, type CommentEntityType } from "@/lib/db";
import { generateId, now } from "@/lib/ids";

export interface CreateCommentInput {
  entityType: CommentEntityType;
  entityId: string;
  /** Free text, matching `Task.assignee`'s no-auth pattern — see AGENTS.md. */
  author: string;
  body: string;
}

/**
 * Resolves and freezes `projectId`/`entityTitle` at post time (task's own project, or the project
 * itself; the task's title or the project's name) — see `Comment`'s doc comment in `db.ts` for why
 * this is denormalized rather than joined live.
 */
export async function createComment(input: CreateCommentInput): Promise<Comment> {
  const target =
    input.entityType === "task" ? await db.tasks.get(input.entityId) : await db.projects.get(input.entityId);
  if (!target) throw new Error(`${input.entityType === "task" ? "Task" : "Project"} not found`);
  const projectId = input.entityType === "task" ? (target as { projectId: string }).projectId : target.id;
  const entityTitle = input.entityType === "task" ? (target as { title: string }).title : (target as { name: string }).name;

  const timestamp = now();
  const row: Comment = {
    id: generateId(),
    entityType: input.entityType,
    entityId: input.entityId,
    projectId,
    entityTitle,
    author: input.author.trim() || "Anonymous",
    body: input.body.trim(),
    createdAt: timestamp,
    editedAt: null,
  };
  await db.comments.add(row);
  return row;
}

export async function updateComment(id: string, body: string): Promise<void> {
  await db.comments.update(id, { body: body.trim(), editedAt: now() });
}

export async function deleteComment(id: string): Promise<void> {
  await db.comments.delete(id);
}

/** A single task's or project's own comment thread, oldest first (thread reading order). */
export async function listCommentsForEntity(entityId: string): Promise<Comment[]> {
  const rows = await db.comments.where("entityId").equals(entityId).toArray();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

/** Every comment scoped to a project — its own thread plus every one of its tasks' — for the combined project activity feed. */
export async function listCommentsForProject(projectId: string): Promise<Comment[]> {
  const rows = await db.comments.where("projectId").equals(projectId).toArray();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}
