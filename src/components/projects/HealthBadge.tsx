import { cn } from "@/lib/utils";
import type { ProjectHealth } from "@/lib/db";

const HEALTH_CONFIG: Record<ProjectHealth, { label: string; bg: string; fg: string; dot: string }> = {
  green: {
    label: "On track",
    bg: "bg-health-green-bg",
    fg: "text-health-green-fg",
    dot: "bg-health-green-fg",
  },
  amber: {
    label: "At risk",
    bg: "bg-health-amber-bg",
    fg: "text-health-amber-fg",
    dot: "bg-health-amber-fg",
  },
  red: {
    label: "Off track",
    bg: "bg-health-red-bg",
    fg: "text-health-red-fg",
    dot: "bg-health-red-fg",
  },
};

/** The one place this app uses a decorative-looking dot — it conveys real project health state. */
export function HealthBadge({ health, className }: { health: ProjectHealth; className?: string }) {
  const config = HEALTH_CONFIG[health];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        config.bg,
        config.fg,
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", config.dot)} aria-hidden="true" />
      {config.label}
    </span>
  );
}
