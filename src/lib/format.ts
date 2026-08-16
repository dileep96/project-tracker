/**
 * Shared number formatting for Phase 4's time/cost surfaces (timesheets, budget, capacity) — one
 * place so hours and currency rounding never drift between components. USD-only, no currency
 * picker — consistent with the rest of the app having no multi-user/locale settings yet.
 */

const currencyFormatter = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

/** Minutes -> a compact hour label ("8h", "1.5h", "0.25h") — whole hours skip the decimal, fractional hours keep just enough precision to read back a real number. */
export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${Math.round(hours * 100) / 100}h`;
}

/** Minutes -> "1h 30m" for a more literal duration display (the timer/timesheet row grain). */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Elapsed milliseconds -> "12:34" or "1:02:03" for the running-timer display. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
