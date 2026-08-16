import type { CSSProperties } from "react";

/**
 * Shared Recharts styling — CSS custom-property references (not hex) so every chart repaints
 * automatically when `.dark` toggles on <html>, the same mechanism the rest of the app's design
 * system already relies on (see index.css). Browsers resolve `var()` inside SVG presentation
 * attributes exactly like anywhere else in the cascade, so passing these strings straight into
 * Recharts' `stroke`/`fill` props needs no re-render-on-theme-change plumbing.
 */

/** The sequential teal ramp (see index.css) — step 100 (near-surface) through 700 (max value). */
export const CHART_SEQUENTIAL = [
  "var(--chart-seq-100)",
  "var(--chart-seq-200)",
  "var(--chart-seq-300)",
  "var(--chart-seq-400)",
  "var(--chart-seq-500)",
  "var(--chart-seq-600)",
  "var(--chart-seq-700)",
] as const;

/** The single-series "brand" mark color — step 500, the same lightness band as a button/link. */
export const CHART_BRAND = "var(--chart-seq-500)";
/** Context/reference-line color (e.g. an "ideal" line) — never the subject, always secondary. */
export const CHART_CONTEXT = "var(--muted-foreground)";
export const CHART_GRID = "var(--border)";
export const CHART_AXIS_TEXT = "var(--muted-foreground)";

export const CHART_STATUS = {
  good: "var(--health-green-fg)",
  warning: "var(--health-amber-fg)",
  critical: "var(--health-red-fg)",
};

/** Quantizes a count into a sequential-ramp step index (0 = lightest). Reserves index 0 for "no data" so a genuine zero-but-tracked cell (step 1) still reads as distinct from an empty one. */
export function sequentialStep(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  const steps = CHART_SEQUENTIAL.length;
  const ratio = value / max;
  return Math.min(steps - 1, Math.max(1, Math.ceil(ratio * (steps - 1))));
}

/** Category/date axis labels ("Jun 24", "Alice Chen") — regular UI text, so Manrope like the rest of the app. */
export const chartTickStyle = { fontSize: 11, fill: CHART_AXIS_TEXT, fontFamily: "var(--font-sans)" };
/** Numeric axis labels (task counts, day counts) — JetBrains Mono, matching the app's own rule for "dates, counts, identifiers" (see README/AGENTS.md). Also sidesteps a Chromium bug where SVG <text> mis-renders certain digits of the variable-weight sans at small sizes. */
export const chartNumberTickStyle = { fontSize: 11, fill: CHART_AXIS_TEXT, fontFamily: "var(--font-mono)" };

export const chartTooltipContentStyle: CSSProperties = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  fontSize: 12,
  boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
};

export const chartTooltipLabelStyle: CSSProperties = {
  color: "var(--foreground)",
  fontWeight: 600,
  marginBottom: 2,
};
