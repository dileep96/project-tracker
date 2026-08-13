import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TaskStatus } from "@/lib/db";
import { cn } from "@/lib/utils";

interface StatusSelectProps {
  statuses: TaskStatus[];
  value: string;
  onChange: (statusId: string) => void;
  className?: string;
}

/** Renders as a plain badge until interacted with, so a dense table row doesn't look like a form. */
export function StatusSelect({ statuses, value, onChange, className }: StatusSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        className={cn(
          "h-7 w-fit gap-1 border-transparent bg-secondary px-2 text-xs font-medium text-secondary-foreground shadow-none hover:bg-secondary/80",
          className
        )}
      >
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        {statuses.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
