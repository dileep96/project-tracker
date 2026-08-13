import { db, type CustomFieldDef, type CustomFieldType } from "@/lib/db";
import { generateId, now } from "@/lib/ids";

/** Global field defs (projectId null) plus this project's own, ordered. */
export async function listFieldDefsForProject(projectId: string): Promise<CustomFieldDef[]> {
  const all = await db.customFieldDefs.toArray();
  return all
    .filter((f) => f.projectId === null || f.projectId === projectId)
    .sort((a, b) => a.order - b.order);
}

export interface CreateFieldDefInput {
  projectId: string | null;
  name: string;
  type: CustomFieldType;
  options?: string[] | null;
}

export async function createFieldDef(input: CreateFieldDefInput): Promise<CustomFieldDef> {
  const count = await db.customFieldDefs.count();
  const row: CustomFieldDef = {
    id: generateId(),
    projectId: input.projectId,
    name: input.name,
    type: input.type,
    options: input.type === "select" ? input.options ?? [] : null,
    order: count,
    createdAt: now(),
  };
  await db.customFieldDefs.add(row);
  return row;
}

export async function updateFieldDef(id: string, patch: Partial<Omit<CustomFieldDef, "id">>): Promise<void> {
  await db.customFieldDefs.update(id, patch);
}

export async function deleteFieldDef(id: string): Promise<void> {
  await db.transaction("rw", db.customFieldDefs, db.customFieldValues, async () => {
    await db.customFieldValues.where("fieldId").equals(id).delete();
    await db.customFieldDefs.delete(id);
  });
}
