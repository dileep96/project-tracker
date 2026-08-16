import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard, ChartEmptyState } from "@/components/dashboard/ChartCard";
import type { Task } from "@/lib/db";
import { computeCycleTime, computeThroughput } from "@/lib/analytics/trends";
import { CHART_BRAND, CHART_GRID, chartNumberTickStyle, chartTickStyle, chartTooltipContentStyle, chartTooltipLabelStyle } from "@/lib/chart-theme";
import type { DrillDownState } from "@/components/dashboard/DrillDownPanel";

const TREND_WINDOW_DAYS = 84; // 12 weeks — long enough to read a real trend, short enough to stay legible weekly

export function TrendCharts({ tasks, now, onDrillDown }: { tasks: Task[]; now: number; onDrillDown: (state: DrillDownState) => void }) {
  const windowStart = now - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const throughput = useMemo(() => computeThroughput(tasks, windowStart, now), [tasks, windowStart, now]);
  const cycleTime = useMemo(() => computeCycleTime(tasks, windowStart, now), [tasks, windowStart, now]);

  const anyCompleted = tasks.some((t) => t.completedAt !== null);

  return (
    <>
      <ChartCard title="Throughput" description="Tasks completed per week, trailing 12 weeks." span="half">
        {!anyCompleted ? (
          <ChartEmptyState title="No completed tasks yet" hint="Throughput lights up once tasks start getting marked done." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={throughput} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={chartTickStyle} axisLine={{ stroke: CHART_GRID }} tickLine={false} />
              <YAxis tick={chartNumberTickStyle} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
              <Tooltip
                contentStyle={chartTooltipContentStyle}
                labelStyle={chartTooltipLabelStyle}
                formatter={(value) => [`${value} completed`, undefined]}
                cursor={{ fill: "var(--muted)" }}
              />
              <Bar
                dataKey="count"
                name="Completed"
                fill={CHART_BRAND}
                radius={[3, 3, 0, 0]}
                cursor="pointer"
                onClick={(data: unknown) => {
                  const point = data as { payload: (typeof throughput)[number] };
                  if (point.payload.tasks.length > 0) onDrillDown({ label: `Completed — week of ${point.payload.label}`, tasks: point.payload.tasks });
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Cycle time" description="Average days from creation to completion, trailing 12 weeks." span="half">
        {!anyCompleted ? (
          <ChartEmptyState title="No completed tasks yet" hint="Cycle time lights up once tasks start getting marked done." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={cycleTime} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={chartTickStyle} axisLine={{ stroke: CHART_GRID }} tickLine={false} />
              <YAxis
                tick={chartNumberTickStyle}
                axisLine={false}
                tickLine={false}
                width={32}
                label={{ value: "days", angle: -90, position: "insideLeft", style: { fill: "var(--muted-foreground)", fontSize: 11 } }}
              />
              <Tooltip
                contentStyle={chartTooltipContentStyle}
                labelStyle={chartTooltipLabelStyle}
                formatter={(value) => [typeof value !== "number" ? "no completions" : `${value.toFixed(1)} days`, undefined]}
              />
              <Line
                type="monotone"
                dataKey="avgDays"
                name="Avg cycle time"
                stroke={CHART_BRAND}
                strokeWidth={2.5}
                connectNulls
                dot={(props: { cx?: number; cy?: number; index?: number; payload?: (typeof cycleTime)[number] }) => {
                  const { cx, cy, index, payload } = props;
                  if (cx === undefined || cy === undefined || payload === undefined || payload.avgDays === undefined) {
                    return <g key={`dot-${index}`} />;
                  }
                  const clickable = payload.tasks.length > 0;
                  return (
                    <circle
                      key={`dot-${index}`}
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill={CHART_BRAND}
                      cursor={clickable ? "pointer" : undefined}
                      onClick={() => clickable && onDrillDown({ label: `Completed — week of ${payload.label}`, tasks: payload.tasks })}
                    />
                  );
                }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </>
  );
}
