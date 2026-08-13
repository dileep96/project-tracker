import type { DependencyEdge } from "@/lib/dependency-graph";

export interface CpmTaskInput {
  id: string;
  /** Whole days, minimum 1 — see gantt bar duration derivation in GanttChart. */
  durationDays: number;
}

export interface CpmResult {
  earliestStart: Record<string, number>;
  earliestFinish: Record<string, number>;
  latestStart: Record<string, number>;
  latestFinish: Record<string, number>;
  /** Tasks with zero float (earliestStart === latestStart) — the tasks that cannot slip without delaying the project. */
  criticalTaskIds: Set<string>;
  /** `${predecessorId}:${successorId}` keys for edges that are both critical AND "tight" (no slack between them) — what actually draws as a critical link. */
  criticalEdgeKeys: Set<string>;
}

/**
 * Textbook CPM forward/backward pass: nodes are tasks weighted by duration, edges are
 * dependency precedence. This intentionally does NOT use the tasks' own calendar dates as the
 * schedule — it computes the schedule CPM would produce from durations + precedence alone, then
 * float (latestStart - earliestStart) per task tells you which chain is actually critical. The
 * calendar dates the user picked are only used for bar *positioning*, elsewhere.
 */
export function computeCriticalPath(tasks: CpmTaskInput[], edges: DependencyEdge[]): CpmResult {
  const ids = new Set(tasks.map((t) => t.id));
  const duration = new Map(tasks.map((t) => [t.id, Math.max(1, t.durationDays)]));
  const relevantEdges = edges.filter(
    (e) => ids.has(e.predecessorId) && ids.has(e.successorId) && e.predecessorId !== e.successorId
  );

  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  for (const t of tasks) {
    predecessors.set(t.id, []);
    successors.set(t.id, []);
  }
  for (const e of relevantEdges) {
    predecessors.get(e.successorId)!.push(e.predecessorId);
    successors.get(e.predecessorId)!.push(e.successorId);
  }

  // Kahn's algorithm for topological order. Cycles shouldn't reach this (addDependency rejects
  // them at write time), but cross-project edges or stale data could still produce one — any
  // node that never reaches in-degree 0 is appended at the end and treated as having no
  // (surviving) predecessors, so a bad graph degrades to "less accurate" rather than hanging.
  const inDegree = new Map(tasks.map((t) => [t.id, predecessors.get(t.id)!.length]));
  const queue = tasks.filter((t) => inDegree.get(t.id) === 0).map((t) => t.id);
  const order: string[] = [];
  const enqueued = new Set(queue);
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const s of successors.get(id) ?? []) {
      inDegree.set(s, (inDegree.get(s) ?? 0) - 1);
      if (inDegree.get(s) === 0 && !enqueued.has(s)) {
        queue.push(s);
        enqueued.add(s);
      }
    }
  }
  for (const t of tasks) if (!enqueued.has(t.id)) order.push(t.id);

  const earliestStart: Record<string, number> = {};
  const earliestFinish: Record<string, number> = {};
  for (const id of order) {
    const preds = (predecessors.get(id) ?? []).filter((p) => earliestFinish[p] !== undefined);
    earliestStart[id] = preds.length > 0 ? Math.max(...preds.map((p) => earliestFinish[p])) : 0;
    earliestFinish[id] = earliestStart[id] + duration.get(id)!;
  }
  const projectDuration = tasks.length > 0 ? Math.max(0, ...tasks.map((t) => earliestFinish[t.id] ?? 0)) : 0;

  const latestStart: Record<string, number> = {};
  const latestFinish: Record<string, number> = {};
  for (const id of [...order].reverse()) {
    const succs = (successors.get(id) ?? []).filter((s) => latestStart[s] !== undefined);
    latestFinish[id] = succs.length > 0 ? Math.min(...succs.map((s) => latestStart[s])) : projectDuration;
    latestStart[id] = latestFinish[id] - duration.get(id)!;
  }

  const EPSILON = 1e-6;
  const criticalTaskIds = new Set<string>();
  for (const t of tasks) {
    if (Math.abs(latestStart[t.id] - earliestStart[t.id]) < EPSILON) criticalTaskIds.add(t.id);
  }

  const criticalEdgeKeys = new Set<string>();
  for (const e of relevantEdges) {
    if (
      criticalTaskIds.has(e.predecessorId) &&
      criticalTaskIds.has(e.successorId) &&
      Math.abs(earliestFinish[e.predecessorId] - earliestStart[e.successorId]) < EPSILON
    ) {
      criticalEdgeKeys.add(`${e.predecessorId}:${e.successorId}`);
    }
  }

  return { earliestStart, earliestFinish, latestStart, latestFinish, criticalTaskIds, criticalEdgeKeys };
}
