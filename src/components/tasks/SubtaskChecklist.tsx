import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash } from "@phosphor-icons/react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSubtasks } from "@/hooks/use-task-detail";
import { addSubtask, deleteSubtask, reorderSubtasks, updateSubtask } from "@/lib/queries/tasks";
import { cn } from "@/lib/utils";

export function SubtaskChecklist({ taskId }: { taskId: string }) {
  const subtasks = useSubtasks(taskId);
  const [draft, setDraft] = useState("");

  const done = subtasks?.filter((s) => s.done).length ?? 0;
  const total = subtasks?.length ?? 0;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    await addSubtask(taskId, text);
    setDraft("");
  }

  function move(index: number, direction: "up" | "down") {
    if (!subtasks) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= subtasks.length) return;
    const ids = subtasks.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderSubtasks(taskId, ids);
  }

  return (
    <div className="flex flex-col gap-3">
      {total > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
          <span className="font-mono">
            {done}/{total}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {(subtasks ?? []).map((s, index) => (
          <div key={s.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted">
            <Checkbox checked={s.done} onCheckedChange={(checked) => updateSubtask(s.id, { done: checked === true })} />
            <input
              defaultValue={s.text}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value && value !== s.text) updateSubtask(s.id, { text: value });
                else e.target.value = s.text;
              }}
              className={cn(
                "min-w-0 flex-1 bg-transparent text-sm outline-none",
                s.done && "text-muted-foreground line-through"
              )}
            />
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
              <Button variant="ghost" size="icon-xs" aria-label="Move up" disabled={index === 0} onClick={() => move(index, "up")}>
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Move down"
                disabled={index === (subtasks?.length ?? 0) - 1}
                onClick={() => move(index, "down")}
              >
                <ArrowDown />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label="Delete subtask" onClick={() => deleteSubtask(s.id)}>
                <Trash />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a checklist item"
          className="h-8 text-sm"
        />
        <Button type="submit" size="icon-sm" variant="outline" aria-label="Add subtask" disabled={!draft.trim()}>
          <Plus />
        </Button>
      </form>
    </div>
  );
}
