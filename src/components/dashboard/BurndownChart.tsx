import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard, ChartEmptyState } from "@/components/dashboard/ChartCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Project, Task } from "@/lib/db";
import { computeBurndown } from "@/lib/analytics/burndown";
import {
  CHART_BRAND,
  CHART_CONTEXT,
  CHART_GRID,
  chartNumberTickStyle,
  chartTickStyle,
  chartTooltipContentStyle,
  chartTooltipLabelStyle,
} from "@/lib/chart-theme";

type Mode = "burndown" | "burnup";

// Stable reference for the no-selection case — an inline `[]` fallback would be a fresh array
// every render, defeating the useMemo below (its dep would "change" every render for nothing).
const EMPTY_TASKS: Task[] = [];

interface BurndownChartProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  tasksByProject: Record<string, Task[]>;
  now: number;
}

export function BurndownChart({ projects, selectedProjectId, onSelectProject, tasksByProject, now }: BurndownChartProps) {
  const [mode, setMode] = useState<Mode>("burndown");
  const tasks = (selectedProjectId ? tasksByProject[selectedProjectId] : undefined) ?? EMPTY_TASKS;
  const result = useMemo(() => computeBurndown(tasks, now), [tasks, now]);

  const chartData = useMemo(
    () =>
      result.points.map((p) => ({
        label: p.label,
        remaining: p.remaining,
        ideal: mode === "burndown" ? p.ideal : result.totalScope - p.ideal,
        scope: p.scope,
        completed: p.completed,
      })),
    [result, mode]
  );

  return (
    <ChartCard
      title="Burndown / burnup"
      description="Ideal-vs-actual remaining work, derived from task dates — no separate history table."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedProjectId ?? undefined} onValueChange={onSelectProject}>
            <SelectTrigger size="sm" className="h-8 w-40 text-xs">
              <SelectValue placeholder="Choose a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList>
              <TabsTrigger value="burndown">Burndown</TabsTrigger>
              <TabsTrigger value="burnup">Burnup</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      }
    >
      {projects.length === 0 ? (
        <ChartEmptyState title="No projects yet" hint="Create a project to see its burndown here." />
      ) : tasks.length === 0 ? (
        <ChartEmptyState title="No tasks yet" hint="Add tasks with due dates to this project to see its burndown." />
      ) : !result.hasSchedulingData ? (
        <ChartEmptyState
          title="Not enough scheduling data yet"
          hint="This project's tasks have no due dates or completions yet — set a few due dates to unlock the burndown."
        />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={chartTickStyle} axisLine={{ stroke: CHART_GRID }} tickLine={false} />
            <YAxis
              tick={chartNumberTickStyle}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={36}
              label={{ value: "Tasks", angle: -90, position: "insideLeft", style: { fill: "var(--muted-foreground)", fontSize: 11 } }}
            />
            <Tooltip contentStyle={chartTooltipContentStyle} labelStyle={chartTooltipLabelStyle} />
            <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
            {mode === "burnup" && (
              <Area
                type="monotone"
                dataKey="scope"
                name="Total scope"
                stroke="none"
                fill="var(--chart-seq-100)"
                fillOpacity={1}
                connectNulls
              />
            )}
            <Line
              type="monotone"
              dataKey="ideal"
              name="Ideal"
              stroke={CHART_CONTEXT}
              strokeDasharray="5 4"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey={mode === "burndown" ? "remaining" : "completed"}
              name={mode === "burndown" ? "Actual remaining" : "Actual completed"}
              stroke={CHART_BRAND}
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: CHART_BRAND, strokeWidth: 0 }}
              activeDot={{ r: 4.5 }}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
