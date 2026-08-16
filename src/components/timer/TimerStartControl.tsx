import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Play, Stop } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveTimer } from "@/hooks/use-time-entries";
import { useTask } from "@/hooks/use-tasks";
import { usePeople } from "@/hooks/use-people";
import { startTimer, stopTimer } from "@/lib/queries/time-entries";

/**
 * Start/stop control for one specific task — used from the task detail sheet's Time tab. Shows a
 * person + billable picker when idle, an inline "Stop" when this exact task is the one running.
 * When a *different* task's timer is running, starting this one auto-stops it (see
 * `lib/queries/time-entries.ts`'s `startTimer`) — the caption below makes that explicit instead of
 * surprising the user with another task's timer silently ending.
 */
export function TimerStartControl({ taskId, projectId }: { taskId: string; projectId: string }) {
  const timer = useActiveTimer();
  const people = usePeople();
  const otherTask = useTask(timer && timer.taskId !== taskId ? timer.taskId : undefined);
  const [personId, setPersonId] = useState("");
  const [billable, setBillable] = useState(true);

  const activePeople = (people ?? []).filter((p) => p.active);

  useEffect(() => {
    if (!personId && activePeople.length > 0) setPersonId(activePeople[0].id);
  }, [activePeople, personId]);

  const runningHere = timer?.taskId === taskId;

  if (runningHere) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await stopTimer();
          toast.success("Timer stopped and logged");
        }}
      >
        <Stop /> Stop timer
      </Button>
    );
  }

  if (activePeople.length === 0) {
    return <p className="text-xs text-muted-foreground">Add a person (Workload → People) to start a timer.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={personId} onValueChange={setPersonId}>
          <SelectTrigger size="sm" className="h-8 w-40 text-xs">
            <SelectValue placeholder="Who's timing this?" />
          </SelectTrigger>
          <SelectContent>
            {activePeople.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={billable} onCheckedChange={(c) => setBillable(c === true)} /> Billable
        </label>
        <Button
          size="sm"
          disabled={!personId}
          onClick={async () => {
            await startTimer({ taskId, projectId, personId, billable });
            toast.success("Timer started");
          }}
        >
          <Play /> Start
        </Button>
      </div>
      {timer && otherTask && <p className="text-xs text-muted-foreground">Starting this stops the timer running on "{otherTask.title}".</p>}
    </div>
  );
}
