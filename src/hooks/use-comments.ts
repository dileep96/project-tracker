import { useLiveQuery } from "dexie-react-hooks";
import { db, type Comment } from "@/lib/db";

export function useCommentsForEntity(entityId: string | undefined): Comment[] | undefined {
  return useLiveQuery(async () => {
    if (!entityId) return [];
    const rows = await db.comments.where("entityId").equals(entityId).toArray();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }, [entityId]);
}

/** A project's own thread plus every one of its tasks' — see `Comment.projectId`'s doc comment in db.ts. */
export function useCommentsForProject(projectId: string | undefined): Comment[] | undefined {
  return useLiveQuery(async () => {
    if (!projectId) return [];
    const rows = await db.comments.where("projectId").equals(projectId).toArray();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }, [projectId]);
}

/** Every comment across every project — what global search needs to match against. */
export function useAllComments(): Comment[] | undefined {
  return useLiveQuery(() => db.comments.toArray(), []);
}
