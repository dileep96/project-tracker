import type { Task, TaskDependency } from "@/lib/db";

/**
 * Dependencies are stored as directional rows where `type` decides which side is the
 * "must-finish-first" predecessor (`blocked-by`: dependsOnTaskId -> taskId, `blocks`: taskId ->
 * dependsOnTaskId). Every consumer that needs a plain precedence DAG — cycle checks, blocked
 * badges, Gantt critical-path — normalizes through here once rather than re-deriving
 * predecessor/successor from `type` at each call site.
 */
export interface DependencyEdge {
  dependencyId: string;
  /** Must finish before `successorId` can start. */
  predecessorId: string;
  successorId: string;
}

export function normalizeDependencyEdges(deps: TaskDependency[]): DependencyEdge[] {
  return deps.map((d) => {
    const [predecessorId, successorId] =
      d.type === "blocked-by" ? [d.dependsOnTaskId, d.taskId] : [d.taskId, d.dependsOnTaskId];
    return { dependencyId: d.id, predecessorId, successorId };
  });
}

/** True if adding predecessor -> successor would close a cycle in the existing edge set. */
export function wouldCreateCycle(edges: DependencyEdge[], predecessorId: string, successorId: string): boolean {
  if (predecessorId === successorId) return true;
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    const list = adjacency.get(e.predecessorId);
    if (list) list.push(e.successorId);
    else adjacency.set(e.predecessorId, [e.successorId]);
  }
  // A cycle would form iff predecessorId is already reachable FROM successorId.
  const stack = [successorId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === predecessorId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of adjacency.get(current) ?? []) stack.push(next);
  }
  return false;
}

/** A task is blocked while any task that must finish before it is still incomplete. */
export function isTaskBlocked(taskId: string, edges: DependencyEdge[], tasksById: Record<string, Task>): boolean {
  return edges.some((e) => {
    if (e.successorId !== taskId) return false;
    const predecessor = tasksById[e.predecessorId];
    return predecessor !== undefined && predecessor.completedAt === null;
  });
}

/** Titles of the incomplete tasks currently blocking `taskId` — for a tooltip on the blocked badge. */
export function blockingTaskTitles(taskId: string, edges: DependencyEdge[], tasksById: Record<string, Task>): string[] {
  return edges
    .filter((e) => e.successorId === taskId)
    .map((e) => tasksById[e.predecessorId])
    .filter((t): t is Task => t !== undefined && t.completedAt === null)
    .map((t) => t.title);
}
