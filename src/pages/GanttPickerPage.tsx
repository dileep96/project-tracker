import { ChartBarHorizontal } from "@phosphor-icons/react";
import { ProjectPickerPage } from "@/components/projects/ProjectPickerPage";

export function GanttPickerPage() {
  return (
    <ProjectPickerPage
      title="Gantt"
      description="Pick a project to see its schedule and critical path."
      icon={ChartBarHorizontal}
      buildPath={(id) => `/projects/${id}/gantt`}
    />
  );
}
