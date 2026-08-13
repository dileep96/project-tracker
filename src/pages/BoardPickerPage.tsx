import { Kanban } from "@phosphor-icons/react";
import { ProjectPickerPage } from "@/components/projects/ProjectPickerPage";

export function BoardPickerPage() {
  return (
    <ProjectPickerPage
      title="Board"
      description="Pick a project to see its Kanban board."
      icon={Kanban}
      buildPath={(id) => `/projects/${id}/board`}
    />
  );
}
