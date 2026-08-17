import type { Project, ReportFilters, Task } from "@/lib/db";
import { startOfDay } from "@/lib/analytics/date-buckets";

/** Same predicate shape TaskTable's own filter bar uses — kept here so the report builder and any future consumer share one definition instead of drifting apart. */
export function applyReportFilters(tasks: Task[], filters: ReportFilters, statusName: (task: Task) => string): Task[] {
  return tasks.filter((t) => {
    if (filters.projectId && t.projectId !== filters.projectId) return false;
    if (filters.statusName && statusName(t) !== filters.statusName) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.assignee && !t.assignee.toLowerCase().includes(filters.assignee.toLowerCase())) return false;
    // Added in Phase 5 for the /ask natural-language query feature (see AGENTS.md) — the report
    // builder's own UI never sets this, so `undefined` (every pre-existing SavedReportView) and
    // `null` both mean "no constraint" here, identically. `completedAt` is typed as always
    // `number | null`, but a task record from outside the app's own createTask/updateTask (hand-
    // written test/import data missing the field entirely) can have it `undefined` — coerce that to
    // `null` too rather than let a missing field silently read as "completed" via `!== null`.
    const completedAt = t.completedAt ?? null;
    if (filters.completed === true && completedAt === null) return false;
    if (filters.completed === false && completedAt !== null) return false;
    // Compare by calendar day, not raw epoch value. dueDate/startDate are always local midnight in
    // this app's own UI, but createdAt/completedAt carry real time-of-day precision — a raw `>`/`<`
    // comparison against a midnight dateTo wrongly excluded same-day results for those two fields
    // (and would exclude a later-in-the-day dueDate too, if one were ever produced by something
    // other than this app's own date picker). Normalizing both sides to their own calendar day
    // makes "on or before dateTo" actually mean the whole dateTo day, regardless of time-of-day on
    // either side. See AGENTS.md for the bug this fixes.
    const dateValue = t[filters.dateField];
    if (filters.dateFrom !== null && (dateValue === null || startOfDay(dateValue) < startOfDay(filters.dateFrom)))
      return false;
    if (filters.dateTo !== null && (dateValue === null || startOfDay(dateValue) > startOfDay(filters.dateTo)))
      return false;
    return true;
  });
}

export const EMPTY_REPORT_FILTERS: ReportFilters = {
  projectId: null,
  statusName: null,
  priority: null,
  assignee: null,
  dateField: "dueDate",
  dateFrom: null,
  dateTo: null,
  completed: null,
};

export interface ExportRow {
  project: string;
  title: string;
  status: string;
  priority: string;
  assignee: string;
  startDate: string;
  dueDate: string;
  completedDate: string;
  tags: string;
}

const exportDateFormatter = new Intl.DateTimeFormat("en-CA"); // yyyy-mm-dd — unambiguous across locales in a spreadsheet

function formatExportDate(value: number | null): string {
  return value === null ? "" : exportDateFormatter.format(value);
}

export function buildExportRows(
  tasks: Task[],
  projectsById: Record<string, Project>,
  statusName: (task: Task) => string
): ExportRow[] {
  return tasks.map((t) => ({
    project: projectsById[t.projectId]?.name ?? "—",
    title: t.title,
    status: statusName(t),
    priority: t.priority,
    assignee: t.assignee || "Unassigned",
    startDate: formatExportDate(t.startDate),
    dueDate: formatExportDate(t.dueDate),
    completedDate: formatExportDate(t.completedAt),
    tags: t.tags.join(", "),
  }));
}

const EXPORT_COLUMNS: { key: keyof ExportRow; header: string }[] = [
  { key: "project", header: "Project" },
  { key: "title", header: "Title" },
  { key: "status", header: "Status" },
  { key: "priority", header: "Priority" },
  { key: "assignee", header: "Assignee" },
  { key: "startDate", header: "Start date" },
  { key: "dueDate", header: "Due date" },
  { key: "completedDate", header: "Completed" },
  { key: "tags", header: "Tags" },
];

function csvCell(value: string): string {
  // RFC 4180: quote any field containing a comma, quote, or newline; escape embedded quotes by doubling them.
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function exportRowsAsCsv(rows: ExportRow[], filename: string): void {
  const header = EXPORT_COLUMNS.map((c) => csvCell(c.header)).join(",");
  const lines = rows.map((row) => EXPORT_COLUMNS.map((c) => csvCell(row[c.key])).join(","));
  const csv = [header, ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerBlobDownload(blob, filename);
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportRowsAsXlsx(rows: ExportRow[], filename: string): Promise<void> {
  const writeExcelFile = (await import("write-excel-file/browser")).default;
  // Raw sheetData form (header row + one value-cell row per task) rather than the object+columns
  // form — our column set is fixed and already flattened into ExportRow, so a per-column `cell()`
  // closure per field would just re-derive what buildExportRows already computed.
  const headerRow = EXPORT_COLUMNS.map((c) => ({ value: c.header, fontWeight: "bold" as const }));
  const dataRows = rows.map((row) => EXPORT_COLUMNS.map((c) => ({ value: row[c.key] })));
  await writeExcelFile([headerRow, ...dataRows], {
    columns: EXPORT_COLUMNS.map(() => ({ width: 18 })),
    sheet: "Tasks",
  }).toFile(filename);
}

export async function exportRowsAsPdf(rows: ExportRow[], filename: string, title: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`${rows.length} task${rows.length === 1 ? "" : "s"} — exported ${exportDateFormatter.format(Date.now())}`, 14, 21);
  autoTable(doc, {
    startY: 26,
    head: [EXPORT_COLUMNS.map((c) => c.header)],
    body: rows.map((row) => EXPORT_COLUMNS.map((c) => row[c.key])),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [0, 107, 98] }, // the app's own primary teal
    margin: { left: 14, right: 14 },
  });
  doc.save(filename);
}
