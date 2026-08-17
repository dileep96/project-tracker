import { ChatCircleText, Lightning, PencilSimple } from "@phosphor-icons/react";
import { useActivityFeed, type ActivityScope } from "@/hooks/use-activity";
import type { ActivityItem } from "@/lib/analytics/activity";
import type { TrackedProjectField, TrackedTaskField } from "@/lib/db";

const timeFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const FIELD_LABEL: Record<TrackedTaskField | TrackedProjectField, string> = {
  title: "Title",
  statusId: "Status",
  priority: "Priority",
  assignee: "Assignee",
  startDate: "Start date",
  dueDate: "Due date",
  completedAt: "Completion",
  name: "Name",
  status: "Status",
  health: "Health",
};

/** Same trigger vocabulary as `AutomationRunLogList` — kept in sync deliberately. */
const TRIGGER_LABEL: Record<string, string> = {
  statusChanged: "Status changed",
  taskOverdue: "Became overdue",
  taskCreated: "Task created",
};

/** `showEntityTitle` is true only for a project's combined feed, where a row could belong to any of the project's tasks (or the project itself) and needs to say which. */
function ActivityRow({ item, showEntityTitle }: { item: ActivityItem; showEntityTitle: boolean }) {
  if (item.kind === "fieldChange" && item.fieldChange) {
    const change = item.fieldChange;
    return (
      <div className="flex items-start gap-2.5 rounded-md border border-border/60 px-2.5 py-1.5 text-xs">
        <PencilSimple className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            {showEntityTitle && <span className="min-w-0 truncate font-medium">{change.entityTitle}</span>}
            <span className="text-muted-foreground">{FIELD_LABEL[change.field] ?? change.field}:</span>
            <span>
              {change.fromValue ?? "—"} → {change.toValue ?? "—"}
            </span>
          </div>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{timeFormatter.format(item.at)}</span>
      </div>
    );
  }

  if (item.kind === "comment" && item.comment) {
    const comment = item.comment;
    return (
      <div className="flex items-start gap-2.5 rounded-md border border-border/60 px-2.5 py-1.5 text-xs">
        <ChatCircleText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="font-medium">{comment.author}</span>
            <span className="text-muted-foreground">commented{showEntityTitle ? ` on "${comment.entityTitle}"` : ""}</span>
          </div>
          <p className="mt-0.5 truncate text-muted-foreground">{comment.body}</p>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{timeFormatter.format(item.at)}</span>
      </div>
    );
  }

  if (item.kind === "automation" && item.automation) {
    const entry = item.automation;
    return (
      <div className="flex items-start gap-2.5 rounded-md border border-border/60 px-2.5 py-1.5 text-xs">
        <Lightning className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="font-medium">{entry.ruleName}</span>
            <span className="text-muted-foreground">{TRIGGER_LABEL[entry.trigger] ?? entry.trigger}</span>
            {showEntityTitle && <span className="min-w-0 truncate text-muted-foreground">on "{entry.taskTitle}"</span>}
          </div>
          <p className="mt-0.5 truncate text-muted-foreground">{entry.summary}</p>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{timeFormatter.format(item.at)}</span>
      </div>
    );
  }

  return null;
}

/**
 * The unified activity tab: field changes, comments, and automation firings, chronologically
 * merged (see `useActivityFeed`). This is deliberately the *only* place those three sources are
 * shown together — `AutomationRunLogList` (project Settings) still shows the raw automation log on
 * its own for rule-debugging purposes, and isn't replaced by this.
 */
export function ActivityFeed({ scope }: { scope: ActivityScope }) {
  const items = useActivityFeed(scope);

  if (items === undefined) {
    return <div className="h-24 animate-pulse rounded-md bg-muted" />;
  }
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
        Nothing here yet — field changes, comments, and automation firings will show up as they happen.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <ActivityRow key={item.id} item={item} showEntityTitle={scope.type === "project"} />
      ))}
    </div>
  );
}
