import { cn } from "@/lib/utils";
import type { TaskPriority } from "@/lib/db";

/**
 * Priority intentionally does NOT reuse the health red/amber/green ramp —
 * two stoplight systems on the same screen would compete for attention.
 * Instead it's a neutral-to-accent intensity scale.
 */
const PRIORITY_CONFIG: Record<TaskPriority, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", className: "bg-secondary text-secondary-foreground" },
  high: { label: "High", className: "bg-accent text-accent-foreground" },
  urgent: { label: "Urgent", className: "bg-destructive/10 text-destructive" },
};

export function PriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }) {
  const config = PRIORITY_CONFIG[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
