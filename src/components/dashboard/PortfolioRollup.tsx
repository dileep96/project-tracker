import { useNavigate } from "react-router-dom";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { ChartCard, ChartEmptyState } from "@/components/dashboard/ChartCard";
import { HealthBadge } from "@/components/projects/HealthBadge";
import { Button } from "@/components/ui/button";
import type { Project, Task } from "@/lib/db";
import type { DrillDownState } from "@/components/dashboard/DrillDownPanel";
import { cn } from "@/lib/utils";

interface PortfolioRollupProps {
  projects: Project[];
  tasksByProject: Record<string, Task[]>;
  now: number;
  onDrillDown: (state: DrillDownState) => void;
}

/** Every project's health + progress on one screen — the point is *not* clicking through projects one at a time to gauge fleet health. */
export function PortfolioRollup({ projects, tasksByProject, now, onDrillDown }: PortfolioRollupProps) {
  const navigate = useNavigate();

  return (
    <ChartCard title="Portfolio rollup" description="Every project's health and progress, at a glance.">
      {projects.length === 0 ? (
        <ChartEmptyState title="No projects yet" hint="Create a project to see it summarized here." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const tasks = tasksByProject[project.id] ?? [];
            const total = tasks.length;
            const completed = tasks.filter((t) => t.completedAt !== null).length;
            const overdue = tasks.filter((t) => t.completedAt === null && t.dueDate !== null && t.dueDate < now).length;
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

            return (
              <div
                key={project.id}
                role="button"
                tabIndex={0}
                onClick={() => onDrillDown({ label: `${project.name} — all tasks`, tasks })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onDrillDown({ label: `${project.name} — all tasks`, tasks });
                  }
                }}
                className="flex cursor-pointer flex-col gap-2.5 rounded-lg border border-border p-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{project.name}</p>
                    <HealthBadge health={project.health} className="mt-1" />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Open ${project.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/projects/${project.id}`);
                    }}
                  >
                    <ArrowSquareOut />
                  </Button>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {completed}/{total} done
                    </span>
                    <span className="font-mono font-medium tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-chart-seq-500 transition-[width]" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                {overdue > 0 && (
                  <span className={cn("w-fit rounded-full bg-health-red-bg px-1.5 py-0.5 text-[11px] font-medium text-health-red-fg")}>
                    {overdue} overdue
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}
