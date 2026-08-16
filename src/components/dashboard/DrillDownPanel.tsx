import { FunnelSimple, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TaskTable } from "@/components/tasks/TaskTable";
import type { Project, Task, TaskStatus } from "@/lib/db";

export interface DrillDownState {
  label: string;
  tasks: Task[];
}

interface DrillDownPanelProps {
  drillDown: DrillDownState;
  onClear: () => void;
  statusesForProject: (projectId: string) => TaskStatus[];
  onOpenTask: (taskId: string) => void;
  projectsById: Record<string, Project>;
}

/**
 * Every chart's click-to-drill-down lands here: it reuses TaskTable verbatim (per Phase 3's
 * scope — no second table component) against whatever subset the clicked segment computed, so
 * "click a bar" really does filter the task list rather than just looking clickable.
 */
export function DrillDownPanel({ drillDown, onClear, statusesForProject, onOpenTask, projectsById }: DrillDownPanelProps) {
  return (
    <Card className="col-span-full border-primary/30 ring-primary/20">
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
        <div className="flex items-center gap-2">
          <FunnelSimple className="size-4 text-primary" />
          <div>
            <p className="text-sm font-semibold">{drillDown.label}</p>
            <p className="text-xs text-muted-foreground">
              {drillDown.tasks.length} task{drillDown.tasks.length === 1 ? "" : "s"} — filtered from a dashboard chart
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X /> Clear filter
        </Button>
      </CardHeader>
      <CardContent>
        <TaskTable
          tasks={drillDown.tasks}
          statusesForProject={statusesForProject}
          onOpenTask={onOpenTask}
          showProjectColumn
          projectsById={projectsById}
          emptyMessage="No tasks match this segment."
        />
      </CardContent>
    </Card>
  );
}
