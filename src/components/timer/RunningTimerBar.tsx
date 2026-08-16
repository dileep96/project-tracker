import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Stop } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useActiveTimer } from "@/hooks/use-time-entries";
import { useTask } from "@/hooks/use-tasks";
import { usePerson } from "@/hooks/use-people";
import { stopTimer } from "@/lib/queries/time-entries";
import { formatElapsed } from "@/lib/format";

/**
 * A slim sticky bar shown app-wide the moment a timer is running, so it's impossible to lose
 * track of one by navigating away from wherever it was started. Elapsed time is recomputed from
 * `timer.startedAt` on every render, ticked by a plain `setInterval` — the persisted `startedAt`
 * (not this component's own state) is what survives a page reload, per the Phase 4 brief's
 * explicit requirement. See `lib/queries/time-entries.ts` for the timer's start/stop logic.
 */
export function RunningTimerBar() {
  const timer = useActiveTimer();
  const task = useTask(timer?.taskId);
  const person = usePerson(timer?.personId);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [timer]);

  if (!timer) return null;
  const elapsed = Date.now() - timer.startedAt;

  return (
    <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-primary/10 px-4 py-2">
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{formatElapsed(elapsed)}</span>
      <span className="min-w-0 flex-1 truncate text-sm">
        {task ? task.title : "Timer running"}
        {person && <span className="text-muted-foreground"> — {person.name}</span>}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await stopTimer();
          toast.success("Timer stopped and logged");
        }}
      >
        <Stop /> Stop
      </Button>
    </div>
  );
}
