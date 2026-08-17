/**
 * Merges the three activity sources — field changes, comments, and Phase 5's automation run log —
 * into one chronological feed. Pure computation, no React, same shape as every other
 * `lib/analytics/*` module (risks.ts, kpis.ts, ...). Deliberately does NOT re-derive automation
 * events from `fieldChangeLog`: an automation action never goes through `updateTask`/`updateProject`
 * (see AGENTS.md), so the two sources never double-count the same real-world change.
 */
import type { AutomationRunLogEntry, Comment, FieldChangeLogEntry } from "@/lib/db";

export type ActivityItemKind = "comment" | "fieldChange" | "automation";

export interface ActivityItem {
  id: string;
  kind: ActivityItemKind;
  /** Sort key — a comment's own post time (`createdAt`), not a later edit, so editing a comment doesn't reshuffle the feed's chronological order. */
  at: number;
  comment?: Comment;
  fieldChange?: FieldChangeLogEntry;
  automation?: AutomationRunLogEntry;
}

/** Most-recent-first, matching `AutomationRunLogList`'s own convention for reading a log top-down. */
export function mergeActivityFeed(
  fieldChanges: FieldChangeLogEntry[],
  comments: Comment[],
  automationLog: AutomationRunLogEntry[]
): ActivityItem[] {
  const items: ActivityItem[] = [
    ...fieldChanges.map((f): ActivityItem => ({ id: `field:${f.id}`, kind: "fieldChange", at: f.changedAt, fieldChange: f })),
    ...comments.map((c): ActivityItem => ({ id: `comment:${c.id}`, kind: "comment", at: c.createdAt, comment: c })),
    ...automationLog.map((a): ActivityItem => ({ id: `automation:${a.id}`, kind: "automation", at: a.firedAt, automation: a })),
  ];
  return items.sort((a, b) => b.at - a.at);
}
