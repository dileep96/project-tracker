import { ClockCounterClockwise } from "@phosphor-icons/react";
import { useAutomationRunLog } from "@/hooks/use-automations";

const timeFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const TRIGGER_LABEL: Record<string, string> = {
  statusChanged: "Status changed",
  taskOverdue: "Became overdue",
  taskCreated: "Task created",
};

/** Recent automation firings for this project — rule name, task affected, what happened, when. Kept simple and stable: this is the shape Phase 6's notification center is meant to read (see AGENTS.md). */
export function AutomationRunLogList({ projectId }: { projectId: string }) {
  const entries = useAutomationRunLog(projectId, 25);

  if ((entries ?? []).length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <ClockCounterClockwise className="size-3.5" /> Recent activity
      </h3>
      <div className="flex flex-col gap-1">
        {entries!.map((entry) => (
          <div key={entry.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md border border-border/60 px-2.5 py-1.5 text-xs">
            <span className="font-medium">{entry.ruleName}</span>
            <span className="text-muted-foreground">{TRIGGER_LABEL[entry.trigger] ?? entry.trigger}</span>
            <span className="min-w-0 truncate text-muted-foreground">on "{entry.taskTitle}"</span>
            <span className="text-muted-foreground">— {entry.summary}</span>
            <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{timeFormatter.format(entry.firedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
