import type { Icon } from "@phosphor-icons/react";
import { Info, Minus, TrendDown, TrendUp } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { KpiResult } from "@/lib/analytics/kpis";

function formatValue(result: KpiResult): string {
  if (result.value === null) return "—";
  switch (result.format) {
    case "percent":
      return `${Math.round(result.value)}%`;
    case "rate":
      return result.value.toFixed(1);
    case "count":
    default:
      return String(Math.round(result.value));
  }
}

function formatDelta(result: KpiResult): string {
  if (result.delta === null || result.delta === undefined) return "";
  const rounded = result.format === "percent" ? Math.round(result.delta) : Math.round(result.delta * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  const unit = result.format === "percent" ? "pt" : "";
  return `${sign}${rounded}${unit}`;
}

interface KpiCardProps {
  result: KpiResult;
  icon: Icon;
  onDrillDown?: (result: KpiResult) => void;
}

/** The dashboard's core "stat tile": the number reads first, everything else is secondary — the exact hierarchy the dataviz skill calls for a headline KPI. Doubles as the drill-down trigger when it has real matching tasks to filter into. */
export function KpiCard({ result, icon: IconComponent, onDrillDown }: KpiCardProps) {
  const notEnoughData = result.value === null;
  const clickable = !notEnoughData && result.matchingTasks.length > 0 && !!onDrillDown;

  const hasDelta = result.delta !== null && result.delta !== undefined && Math.abs(result.delta) >= 0.05;
  const deltaPositive = hasDelta && result.delta! > 0;
  const isGood = hasDelta ? (result.deltaSense === "higher-is-better" ? deltaPositive : !deltaPositive) : null;

  return (
    <Card
      size="sm"
      className={cn(
        "gap-2",
        clickable && "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
      )}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onDrillDown!(result) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onDrillDown!(result);
              }
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between px-6">
        <span className="text-xs font-medium text-muted-foreground">{result.label}</span>
        <IconComponent className="size-4 text-muted-foreground/70" />
      </div>
      <div className="flex items-end justify-between px-6">
        <span
          className={cn(
            "font-mono text-2xl font-semibold tabular-nums",
            notEnoughData ? "text-muted-foreground/50" : result.critical ? "text-health-red-fg" : "text-foreground"
          )}
        >
          {formatValue(result)}
        </span>
        {!notEnoughData && hasDelta && (
          <span
            className={cn(
              "mb-0.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
              isGood ? "bg-health-green-bg text-health-green-fg" : "bg-health-red-bg text-health-red-fg"
            )}
          >
            {deltaPositive ? <TrendUp className="size-3" /> : <TrendDown className="size-3" />}
            {formatDelta(result)}
          </span>
        )}
        {!notEnoughData && !hasDelta && result.delta !== undefined && (
          <span className="mb-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground">
            <Minus className="size-3" /> steady
          </span>
        )}
      </div>
      {notEnoughData && result.notEnoughDataReason && (
        <p className="flex items-start gap-1 px-6 text-[11px] leading-snug text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" />
          {result.notEnoughDataReason}
        </p>
      )}
    </Card>
  );
}
