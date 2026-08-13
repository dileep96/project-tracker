import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Star, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTaskStatuses } from "@/hooks/use-task-statuses";
import { createStatus, deleteStatus, moveStatus, renameStatus, setDefaultStatus } from "@/lib/queries/task-statuses";
import { cn } from "@/lib/utils";

export function StatusManager({ projectId }: { projectId: string }) {
  const statuses = useTaskStatuses(projectId);
  const [newStatus, setNewStatus] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newStatus.trim()) return;
    await createStatus(projectId, newStatus.trim());
    setNewStatus("");
  }

  async function handleDelete(id: string) {
    const reason = await deleteStatus(projectId, id);
    if (reason) toast.error(reason);
    else toast.success("Status deleted");
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        This project's task workflow. Newly created tasks start in the default status.
      </p>
      <div className="flex flex-col gap-1.5">
        {(statuses ?? []).map((s, index) => (
          <div key={s.id} className="group flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
            <input
              defaultValue={s.name}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value && value !== s.name) renameStatus(s.id, value);
                else e.target.value = s.name;
              }}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={s.isDefault ? "Default status" : "Set as default"}
              onClick={() => setDefaultStatus(projectId, s.id)}
              className={cn(!s.isDefault && "opacity-0 group-hover:opacity-100")}
            >
              <Star weight={s.isDefault ? "fill" : "regular"} className={cn(s.isDefault && "text-primary")} />
            </Button>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
              <Button variant="ghost" size="icon-xs" aria-label="Move up" disabled={index === 0} onClick={() => moveStatus(projectId, s.id, "up")}>
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Move down"
                disabled={index === (statuses?.length ?? 0) - 1}
                onClick={() => moveStatus(projectId, s.id, "down")}
              >
                <ArrowDown />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label="Delete status" onClick={() => handleDelete(s.id)}>
                <Trash />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value)}
          placeholder="Add a status, e.g. In Review"
          className="h-8 text-sm"
        />
        <Button type="submit" size="icon-sm" variant="outline" aria-label="Add status" disabled={!newStatus.trim()}>
          <Plus />
        </Button>
      </form>
    </div>
  );
}
