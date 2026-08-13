import { db, type Attachment } from "@/lib/db";
import { generateId, now } from "@/lib/ids";

export async function listAttachmentsForTask(taskId: string): Promise<Attachment[]> {
  const rows = await db.attachments.where("taskId").equals(taskId).toArray();
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addAttachment(taskId: string, file: File): Promise<Attachment> {
  const row: Attachment = {
    id: generateId(),
    taskId,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    blob: file,
    size: file.size,
    createdAt: now(),
  };
  await db.attachments.add(row);
  return row;
}

export async function deleteAttachment(id: string): Promise<void> {
  await db.attachments.delete(id);
}
