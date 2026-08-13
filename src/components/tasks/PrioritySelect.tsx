import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_PRIORITIES, type TaskPriority } from "@/lib/db";
import { cn } from "@/lib/utils";

const LABELS: Record<TaskPriority, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };

const TRIGGER_TONE: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-secondary text-secondary-foreground",
  high: "bg-accent text-accent-foreground",
  urgent: "bg-destructive/10 text-destructive",
};

export function PrioritySelect({
  value,
  onChange,
  className,
}: {
  value: TaskPriority;
  onChange: (priority: TaskPriority) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TaskPriority)}>
      <SelectTrigger
        size="sm"
        className={cn(
          "h-7 w-fit gap-1 border-transparent px-2 text-xs font-medium shadow-none",
          TRIGGER_TONE[value],
          className
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TASK_PRIORITIES.map((p) => (
          <SelectItem key={p} value={p}>
            {LABELS[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
