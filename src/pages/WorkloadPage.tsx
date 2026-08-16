import { useMemo, useState } from "react";
import { ChartBarHorizontal, UsersThree, Warning } from "@phosphor-icons/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CapacityGrid } from "@/components/workload/CapacityGrid";
import { PeopleManager } from "@/components/people/PeopleManager";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { useAllTasks } from "@/hooks/use-tasks";
import { usePeople, useAllTimeOff } from "@/hooks/use-people";
import { computeWorkload, defaultWorkloadWindow, type PersonWorkload, type WorkloadWeek } from "@/lib/analytics/capacity";

const weekLabelFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function WorkloadPage() {
  const tasks = useAllTasks();
  const people = usePeople();
  const timeOff = useAllTimeOff();
  const [selected, setSelected] = useState<{ person: PersonWorkload; week: WorkloadWeek } | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const now = Date.now();
  const window_ = useMemo(() => defaultWorkloadWindow(now), [now]);
  const workload = useMemo(
    () => computeWorkload(people ?? [], tasks ?? [], timeOff ?? [], window_.start, window_.end),
    [people, tasks, timeOff, window_]
  );

  const loading = tasks === undefined || people === undefined || timeOff === undefined;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workload</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Allocated hours vs available capacity, current week plus the next three — who's overloaded, who has room.
        </p>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : (
        <Tabs defaultValue="capacity">
          <TabsList>
            <TabsTrigger value="capacity">
              <ChartBarHorizontal /> Capacity
            </TabsTrigger>
            <TabsTrigger value="people">
              <UsersThree /> People
            </TabsTrigger>
          </TabsList>

          <TabsContent value="capacity" className="flex flex-col gap-4 pt-4">
            {workload.people.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
                <UsersThree className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No active people yet.</p>
                <p className="text-xs text-muted-foreground">Add people under the People tab to see workload here.</p>
              </div>
            ) : (
              <>
                <CapacityGrid buckets={workload.buckets} people={workload.people} onSelectCell={(person, week) => setSelected({ person, week })} />

                <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-health-green-bg ring-1 ring-inset ring-health-green-fg/40" /> Room
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-health-amber-bg ring-1 ring-inset ring-health-amber-fg/40" /> Near capacity
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-health-red-bg ring-1 ring-inset ring-health-red-fg/40" /> Over capacity
                  </span>
                  <span className="ml-auto">Click a cell to see its tasks</span>
                </div>

                {selected && (
                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium">
                        {selected.person.person.name} — week of {weekLabelFormatter.format(selected.week.bucket.start)}
                      </p>
                      <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                        Close
                      </Button>
                    </div>
                    {selected.week.tasks.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nothing allocated this week.</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {selected.week.tasks.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setOpenTaskId(t.id)}
                            className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                          >
                            <span className="truncate">{t.title}</span>
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">{t.estimatedHours}h est.</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {workload.people.some((p) => p.unscheduledHours > 0) && (
                  <div className="rounded-lg border border-dashed border-border p-3">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Unscheduled (no start or due date, not on the grid above)</p>
                    <div className="flex flex-col gap-1">
                      {workload.people
                        .filter((p) => p.unscheduledHours > 0)
                        .map((p) => (
                          <div key={p.person.id} className="flex items-center justify-between text-xs">
                            <span>{p.person.name}</span>
                            <span className="font-mono text-muted-foreground">
                              {p.unscheduledTasks.length} task{p.unscheduledTasks.length === 1 ? "" : "s"} · {p.unscheduledHours}h
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {workload.unmatchedAssignees.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-health-amber-bg bg-health-amber-bg/40 p-3 text-health-amber-fg">
                    <Warning className="mt-0.5 size-4 shrink-0" />
                    <div className="text-xs">
                      <p className="font-medium">
                        {workload.unmatchedAssignees.length} assignee name{workload.unmatchedAssignees.length === 1 ? "" : "s"} without a matching
                        person record — not counted above:
                      </p>
                      <p className="mt-0.5 opacity-90">
                        {workload.unmatchedAssignees.map((u) => `${u.assignee} (${u.tasks.length})`).join(", ")}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="people" className="pt-4">
            <PeopleManager />
          </TabsContent>
        </Tabs>
      )}

      <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  );
}
