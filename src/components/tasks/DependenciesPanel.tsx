import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAllTasks } from "@/hooks/use-tasks";
import { useProjects } from "@/hooks/use-projects";
import { useDependencies } from "@/hooks/use-task-detail";
import { addDependency, removeDependency } from "@/lib/queries/tasks";
import type { DependencyType } from "@/lib/db";

const TYPE_LABEL: Record<DependencyType, string> = { blocks: "Blocks", "blocked-by": "Blocked by" };

function AddDependencyPopover({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<DependencyType>("blocked-by");
  const allTasks = useAllTasks();
  const projects = useProjects();
  const projectsById = useMemo(() => Object.fromEntries((projects ?? []).map((p) => [p.id, p])), [projects]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (allTasks ?? [])
      .filter((t) => t.id !== taskId && t.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allTasks, query, taskId]);

  async function pick(dependsOnTaskId: string) {
    const result = await addDependency(taskId, dependsOnTaskId, type);
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    toast.success("Dependency added");
    setQuery("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus /> Add dependency
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="flex flex-col gap-2">
          <Select value={type} onValueChange={(v) => setType(v as DependencyType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blocked-by">Blocked by…</SelectItem>
              <SelectItem value="blocks">Blocks…</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks by title…"
            autoFocus
          />
          {results.length > 0 && (
            <div className="flex max-h-48 flex-col overflow-y-auto rounded-md border border-border">
              {results.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pick(t.id)}
                  className="flex flex-col items-start gap-0.5 px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className="truncate">{t.title}</span>
                  <span className="text-xs text-muted-foreground">{projectsById[t.projectId]?.name ?? ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DependenciesPanel({ taskId }: { taskId: string }) {
  const dependencies = useDependencies(taskId);
  const allTasks = useAllTasks();
  const projects = useProjects();
  const tasksById = useMemo(() => Object.fromEntries((allTasks ?? []).map((t) => [t.id, t])), [allTasks]);
  const projectsById = useMemo(() => Object.fromEntries((projects ?? []).map((p) => [p.id, p])), [projects]);

  return (
    <div className="flex flex-col gap-3">
      {(dependencies ?? []).length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          No dependencies linked yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {dependencies!.map((dep) => {
            const target = tasksById[dep.dependsOnTaskId];
            return (
              <div key={dep.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                  {TYPE_LABEL[dep.type]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{target?.title ?? "Task no longer exists"}</p>
                  {target && (
                    <p className="truncate text-xs text-muted-foreground">
                      {projectsById[target.projectId]?.name ?? ""}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove dependency"
                  onClick={() => removeDependency(dep.id)}
                >
                  <X />
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <AddDependencyPopover taskId={taskId} />
    </div>
  );
}
