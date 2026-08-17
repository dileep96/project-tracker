import {
  db,
  type CustomFieldDef,
  type CustomFieldValue,
  type Milestone,
  type Project,
  type Subtask,
  type Task,
  type TaskDependency,
  type TaskStatus,
} from "@/lib/db";
import { now } from "@/lib/ids";
import { triggerBlobDownload } from "@/lib/analytics/report";

export const EXPORT_FORMAT_VERSION = 1 as const;

/**
 * One project's worth of exported data. Deliberately does **not** include `attachments` (binary
 * blobs — a real trade-off, not an oversight, see AGENTS.md), `comments`/`fieldChangeLog` (Phase 6
 * logs, not portable "data" in the sense this feature targets), `automationRules`/`automationRunLog`,
 * or time/budget data (`timeEntries`/`people` are cross-project, not owned by any one project). The
 * scope here matches exactly what the Phase 7 brief's acceptance criteria names: tasks, custom
 * fields, and dependencies, plus the statuses/milestones/subtasks needed to make those meaningful.
 */
export interface ExportedProjectBundle {
  project: Project;
  statuses: TaskStatus[];
  /** Project-scoped custom field defs only — global ones travel once at the bundle level (`ExportBundle.globalCustomFieldDefs`), not per-project. */
  customFieldDefs: CustomFieldDef[];
  milestones: Milestone[];
  tasks: Task[];
  subtasks: Subtask[];
  customFieldValues: CustomFieldValue[];
  /**
   * Dependency edges. For a single-project export, only edges where **both** endpoints are inside
   * this project's own task set are included — `dependsOnTaskId` isn't scoped to the same project
   * in this app (see db.ts), so an edge pointing outside the exported set can't be meaningfully
   * round-tripped; the edge itself still exists untouched in the live data this export was taken
   * from, this is only a limitation of the *reimported copy*. An "export everything" bundle needs no
   * such filtering since every possible target is already included.
   */
  dependencies: TaskDependency[];
}

export interface ExportBundle {
  formatVersion: typeof EXPORT_FORMAT_VERSION;
  exportedAt: number;
  scope: "project" | "all";
  /** Every global (`projectId: null`) custom field def, included unconditionally so any task value that references one always resolves on import — see `lib/io/import.ts`. */
  globalCustomFieldDefs: CustomFieldDef[];
  projects: ExportedProjectBundle[];
}

async function buildProjectBundle(project: Project, restrictDependenciesTo: Set<string> | null): Promise<ExportedProjectBundle> {
  const [statuses, allFieldDefs, milestones, tasks] = await Promise.all([
    db.taskStatuses.where("projectId").equals(project.id).toArray(),
    db.customFieldDefs.toArray(),
    db.milestones.where("projectId").equals(project.id).toArray(),
    db.tasks.where("projectId").equals(project.id).toArray(),
  ]);
  const customFieldDefs = allFieldDefs.filter((f) => f.projectId === project.id);

  const [subtaskLists, valueLists, depLists] = await Promise.all([
    Promise.all(tasks.map((t) => db.subtasks.where("taskId").equals(t.id).toArray())),
    Promise.all(tasks.map((t) => db.customFieldValues.where("taskId").equals(t.id).toArray())),
    Promise.all(tasks.map((t) => db.taskDependencies.where("taskId").equals(t.id).toArray())),
  ]);
  const subtasks = subtaskLists.flat();
  const customFieldValues = valueLists.flat();
  const allDeps = depLists.flat();
  const dependencies = restrictDependenciesTo === null ? allDeps : allDeps.filter((d) => restrictDependenciesTo.has(d.dependsOnTaskId));

  return { project, statuses, customFieldDefs, milestones, tasks, subtasks, customFieldValues, dependencies };
}

export async function buildProjectExportBundle(projectId: string): Promise<ExportBundle> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error("Project not found");
  const tasks = await db.tasks.where("projectId").equals(projectId).toArray();
  const bundle = await buildProjectBundle(project, new Set(tasks.map((t) => t.id)));
  const globalCustomFieldDefs = (await db.customFieldDefs.toArray()).filter((f) => f.projectId === null);
  return { formatVersion: EXPORT_FORMAT_VERSION, exportedAt: now(), scope: "project", globalCustomFieldDefs, projects: [bundle] };
}

export async function buildFullExportBundle(): Promise<ExportBundle> {
  const projects = await db.projects.toArray();
  const projectBundles = await Promise.all(projects.map((p) => buildProjectBundle(p, null)));
  const globalCustomFieldDefs = (await db.customFieldDefs.toArray()).filter((f) => f.projectId === null);
  return { formatVersion: EXPORT_FORMAT_VERSION, exportedAt: now(), scope: "all", globalCustomFieldDefs, projects: projectBundles };
}

export function downloadExportBundle(bundle: ExportBundle, filename: string): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  triggerBlobDownload(blob, filename);
}
