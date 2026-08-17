import { useId } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusSelect } from "@/components/tasks/StatusSelect";
import { PrioritySelect } from "@/components/tasks/PrioritySelect";
import { TagsCell } from "@/components/tasks/cells/TagsCell";
import { SubtaskChecklist } from "@/components/tasks/SubtaskChecklist";
import { AttachmentsPanel } from "@/components/tasks/AttachmentsPanel";
import { CustomFieldsPanel } from "@/components/tasks/CustomFieldsPanel";
import { DependenciesPanel } from "@/components/tasks/DependenciesPanel";
import { RecurrencePanel } from "@/components/tasks/RecurrencePanel";
import { TaskTimePanel } from "@/components/tasks/TaskTimePanel";
import { CommentsPanel } from "@/components/comments/CommentsPanel";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { useTask } from "@/hooks/use-tasks";
import { useTaskStatuses } from "@/hooks/use-task-statuses";
import { useMilestones } from "@/hooks/use-milestones";
import { usePeople } from "@/hooks/use-people";
import { updateTask } from "@/lib/queries/tasks";

function epochToDateInput(value: number | null): string {
  if (value === null) return "";
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateInputToEpoch(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function TaskDetailSheet({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const task = useTask(taskId ?? undefined);
  const statuses = useTaskStatuses(task?.projectId);
  const milestones = useMilestones(task?.projectId);
  const people = usePeople();
  const assigneeListId = useId();

  return (
    <Sheet open={taskId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl">
        {task ? (
          <>
            <SheetHeader className="border-b border-border pb-4">
              <SheetTitle className="sr-only">{task.title}</SheetTitle>
              <SheetDescription className="sr-only">Task details</SheetDescription>
              <Input
                defaultValue={task.title}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value && value !== task.title) updateTask(task.id, { title: value });
                  else e.target.value = task.title;
                }}
                className="border-none px-0 text-base font-semibold shadow-none focus-visible:ring-0 md:text-lg"
              />
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {statuses && (
                  <StatusSelect
                    statuses={statuses}
                    value={task.statusId}
                    onChange={(statusId) => updateTask(task.id, { statusId })}
                  />
                )}
                <PrioritySelect value={task.priority} onChange={(priority) => updateTask(task.id, { priority })} />
              </div>
            </SheetHeader>

            <Tabs defaultValue="details" className="min-h-0 flex-1">
              {/* overflow-x-auto: tabs no longer fit the sheet's own width at mobile widths once
                  this grew past 6 (Phase 4's Time tab, now Phase 6's Comments/Activity) — scroll
                  horizontally within the tab bar itself rather than letting it push past the
                  sheet's edge. See AGENTS.md. */}
              <TabsList className="mx-4 mt-3 w-[calc(100%-2rem)] justify-start overflow-x-auto">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="time">Time</TabsTrigger>
                <TabsTrigger value="subtasks">Subtasks</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="fields">Fields</TabsTrigger>
                <TabsTrigger value="links">Links</TabsTrigger>
                <TabsTrigger value="repeat">Repeat</TabsTrigger>
                <TabsTrigger value="comments">Comments</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <div className="h-[calc(100dvh-11rem)] overflow-y-auto">
                <TabsContent value="details" className="flex flex-col gap-4 px-4 py-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="detail-description">Description</Label>
                    <Textarea
                      id="detail-description"
                      defaultValue={task.description}
                      rows={4}
                      placeholder="Add more detail…"
                      onBlur={(e) => updateTask(task.id, { description: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="detail-start">Start date</Label>
                      <Input
                        id="detail-start"
                        type="date"
                        defaultValue={epochToDateInput(task.startDate)}
                        onChange={(e) => updateTask(task.id, { startDate: dateInputToEpoch(e.target.value) })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="detail-due">Due date</Label>
                      <Input
                        id="detail-due"
                        type="date"
                        defaultValue={epochToDateInput(task.dueDate)}
                        onChange={(e) => updateTask(task.id, { dueDate: dateInputToEpoch(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="detail-assignee">Assignee</Label>
                    <Input
                      id="detail-assignee"
                      list={assigneeListId}
                      defaultValue={task.assignee}
                      placeholder="Unassigned"
                      onBlur={(e) => updateTask(task.id, { assignee: e.target.value })}
                    />
                    <datalist id={assigneeListId}>
                      {(people ?? []).map((p) => (
                        <option key={p.id} value={p.name} />
                      ))}
                    </datalist>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label>Tags</Label>
                    <div className="rounded-md border border-input px-1 py-1">
                      <TagsCell tags={task.tags} onChange={(tags) => updateTask(task.id, { tags })} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="detail-milestone">Milestone</Label>
                    <Select
                      value={task.milestoneId ?? "none"}
                      onValueChange={(v) => updateTask(task.id, { milestoneId: v === "none" ? null : v })}
                    >
                      <SelectTrigger id="detail-milestone" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No milestone</SelectItem>
                        {(milestones ?? []).map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>

                <TabsContent value="time" className="px-4 py-4">
                  <TaskTimePanel task={task} />
                </TabsContent>

                <TabsContent value="subtasks" className="px-4 py-4">
                  <SubtaskChecklist taskId={task.id} />
                </TabsContent>

                <TabsContent value="files" className="px-4 py-4">
                  <AttachmentsPanel taskId={task.id} />
                </TabsContent>

                <TabsContent value="fields" className="px-4 py-4">
                  <CustomFieldsPanel taskId={task.id} projectId={task.projectId} />
                </TabsContent>

                <TabsContent value="links" className="px-4 py-4">
                  <DependenciesPanel taskId={task.id} />
                </TabsContent>

                <TabsContent value="repeat" className="px-4 py-4">
                  <RecurrencePanel
                    taskId={task.id}
                    isRecurring={task.isRecurring}
                    hasDate={task.startDate !== null || task.dueDate !== null}
                  />
                </TabsContent>

                <TabsContent value="comments" className="px-4 py-4">
                  <CommentsPanel entityType="task" entityId={task.id} />
                </TabsContent>

                <TabsContent value="activity" className="px-4 py-4">
                  <ActivityFeed scope={{ type: "task", taskId: task.id }} />
                </TabsContent>
              </div>
            </Tabs>
          </>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Task not found.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
