import { db, type ReportFilters, type SavedReportView } from "@/lib/db";
import { generateId, now } from "@/lib/ids";

export async function listSavedReportViews(): Promise<SavedReportView[]> {
  const rows = await db.savedReportViews.toArray();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createSavedReportView(name: string, filters: ReportFilters): Promise<SavedReportView> {
  const timestamp = now();
  const row: SavedReportView = { id: generateId(), name, filters, createdAt: timestamp, updatedAt: timestamp };
  await db.savedReportViews.add(row);
  return row;
}

export async function deleteSavedReportView(id: string): Promise<void> {
  await db.savedReportViews.delete(id);
}
