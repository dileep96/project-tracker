import { db, type Milestone, type MilestoneStatus } from "@/lib/db";
import { generateId, now } from "@/lib/ids";

export async function listMilestonesForProject(projectId: string): Promise<Milestone[]> {
  const rows = await db.milestones.where("projectId").equals(projectId).toArray();
  return rows.sort((a, b) => a.targetDate - b.targetDate);
}

export interface CreateMilestoneInput {
  projectId: string;
  name: string;
  targetDate: number;
  status?: MilestoneStatus;
}

export async function createMilestone(input: CreateMilestoneInput): Promise<Milestone> {
  const row: Milestone = {
    id: generateId(),
    projectId: input.projectId,
    name: input.name,
    targetDate: input.targetDate,
    status: input.status ?? "upcoming",
    createdAt: now(),
  };
  await db.milestones.add(row);
  return row;
}

export async function updateMilestone(id: string, patch: Partial<Omit<Milestone, "id" | "projectId">>): Promise<void> {
  await db.milestones.update(id, patch);
}

export async function deleteMilestone(id: string): Promise<void> {
  await db.transaction("rw", db.milestones, db.tasks, async () => {
    const linked = await db.tasks.where("milestoneId").equals(id).toArray();
    await Promise.all(linked.map((t) => db.tasks.update(t.id, { milestoneId: null })));
    await db.milestones.delete(id);
  });
}
