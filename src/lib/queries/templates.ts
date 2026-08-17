import { db, type Project, type ProjectTemplate, type TemplateTask } from "@/lib/db";
import { generateId, now } from "@/lib/ids";
import { addDays, DAY_MS, startOfDay } from "@/lib/analytics/date-buckets";
import { createProject } from "@/lib/queries/projects";
import { createTask, getCustomFieldValuesForTask, setCustomFieldValue } from "@/lib/queries/tasks";
import { createFieldDef, listFieldDefsForProject } from "@/lib/queries/custom-fields";

export async function listTemplates(): Promise<ProjectTemplate[]> {
  const rows = await db.projectTemplates.toArray();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.projectTemplates.delete(id);
}

export interface SaveProjectAsTemplateInput {
  projectId: string;
  name: string;
  description?: string;
}

/**
 * Snapshots a project's current shape: its task statuses, its own project-scoped custom field
 * defs, and every non-generated task, with dates converted to day offsets from the project's own
 * start (`startDate ?? createdAt`). Recurring-instance tasks (`recurrenceParentId !== null`) are
 * excluded — the same "not real scheduling meaning" reasoning Gantt/Timeline already exclude them
 * for (see AGENTS.md) — only the recurring *template* task itself (if any) is captured, and only as
 * a plain one-off task; its recurrence rule doesn't travel with the template (see db.ts's
 * `ProjectTemplate` doc comment for the full scope decision).
 */
export async function saveProjectAsTemplate(input: SaveProjectAsTemplateInput): Promise<ProjectTemplate> {
  const project = await db.projects.get(input.projectId);
  if (!project) throw new Error("Project not found");
  const anchor = project.startDate ?? project.createdAt;

  const [statuses, fieldDefs, tasks] = await Promise.all([
    db.taskStatuses.where("projectId").equals(input.projectId).toArray(),
    listFieldDefsForProject(input.projectId), // global + project-scoped — needed to resolve task values by name
    db.tasks.where("projectId").equals(input.projectId).toArray(),
  ]);
  const sortedStatuses = [...statuses].sort((a, b) => a.order - b.order);
  const statusNameById = Object.fromEntries(sortedStatuses.map((s) => [s.id, s.name]));
  const fieldNameById = Object.fromEntries(fieldDefs.map((f) => [f.id, f.name]));
  const projectScopedFieldDefs = fieldDefs.filter((f) => f.projectId === input.projectId).sort((a, b) => a.order - b.order);

  const templateTasks: TemplateTask[] = [];
  for (const task of tasks) {
    if (task.recurrenceParentId !== null) continue; // generated instance, not template-worthy
    const values = await getCustomFieldValuesForTask(task.id);
    const customFieldValues: Record<string, string> = {};
    for (const [fieldId, value] of Object.entries(values)) {
      const name = fieldNameById[fieldId];
      if (name) customFieldValues[name] = value;
    }
    templateTasks.push({
      id: generateId(),
      title: task.title,
      description: task.description,
      priority: task.priority,
      statusName: statusNameById[task.statusId] ?? sortedStatuses[0]?.name ?? "",
      assignee: task.assignee,
      tags: task.tags,
      estimatedHours: task.estimatedHours,
      startOffsetDays:
        task.startDate === null ? null : Math.round((startOfDay(task.startDate) - startOfDay(anchor)) / DAY_MS),
      dueOffsetDays: task.dueDate === null ? null : Math.round((startOfDay(task.dueDate) - startOfDay(anchor)) / DAY_MS),
      customFieldValues,
    });
  }

  const timestamp = now();
  const row: ProjectTemplate = {
    id: generateId(),
    name: input.name,
    description: input.description ?? "",
    sourceProjectId: input.projectId,
    statuses: sortedStatuses.map((s) => ({ name: s.name, order: s.order, isDefault: s.isDefault })),
    customFieldDefs: projectScopedFieldDefs.map((f) => ({ name: f.name, type: f.type, options: f.options, order: f.order })),
    tasks: templateTasks,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.projectTemplates.add(row);
  return row;
}

export interface CreateProjectFromTemplateInput {
  templateId: string;
  name: string;
  description?: string;
  owner?: string;
  /** The new project's real-world start date — every template task's offset is computed from this, never the original project's. */
  startDate: number;
}

export async function createProjectFromTemplate(input: CreateProjectFromTemplateInput): Promise<Project> {
  const template = await db.projectTemplates.get(input.templateId);
  if (!template) throw new Error("Template not found");

  const project = await createProject({
    name: input.name,
    description: input.description ?? template.description,
    owner: input.owner ?? "",
    startDate: input.startDate,
  });

  // createProject seeds the default To Do / In Progress / Done workflow (seedDefaultStatuses) —
  // replace it with the template's own statuses now, before any task references a status id. Safe
  // to bulk-clear directly (bypassing the one-by-one deleteStatus guardrails meant for editing a
  // live, in-use project) since this project was just created and has no tasks yet.
  const statusNameToId: Record<string, string> = {};
  if (template.statuses.length > 0) {
    await db.taskStatuses.where("projectId").equals(project.id).delete();
    const statusRows = template.statuses.map((s) => {
      const id = generateId();
      statusNameToId[s.name] = id;
      return { id, projectId: project.id, name: s.name, order: s.order, isDefault: s.isDefault, createdAt: now() };
    });
    await db.taskStatuses.bulkAdd(statusRows);
  } else {
    // No statuses snapshotted (shouldn't happen for a template saved via saveProjectAsTemplate,
    // which always captures at least the source project's own workflow) — keep the freshly-seeded
    // defaults rather than leaving the new project with zero statuses.
    const seeded = await db.taskStatuses.where("projectId").equals(project.id).toArray();
    for (const s of seeded) statusNameToId[s.name] = s.id;
  }
  const fallbackStatusId = Object.values(statusNameToId)[0];

  for (const fieldDef of template.customFieldDefs) {
    await createFieldDef({ projectId: project.id, name: fieldDef.name, type: fieldDef.type, options: fieldDef.options });
  }

  // Resolve field name -> id against what now actually exists for this project (global fields plus
  // the project-scoped ones just created) — the same exact-name-match join Task.assignee already
  // uses against Person, applied to custom fields instead.
  const fieldDefsForProject = await listFieldDefsForProject(project.id);
  const fieldIdByName = Object.fromEntries(fieldDefsForProject.map((f) => [f.name, f.id]));

  for (const templateTask of template.tasks) {
    const statusId = statusNameToId[templateTask.statusName] ?? fallbackStatusId;
    if (!statusId) continue; // no statuses at all to assign — skip rather than crash
    const startDate = templateTask.startOffsetDays === null ? null : addDays(input.startDate, templateTask.startOffsetDays);
    const dueDate = templateTask.dueOffsetDays === null ? null : addDays(input.startDate, templateTask.dueOffsetDays);
    const task = await createTask({
      projectId: project.id,
      title: templateTask.title,
      description: templateTask.description,
      priority: templateTask.priority,
      statusId,
      assignee: templateTask.assignee,
      tags: templateTask.tags,
      startDate,
      dueDate,
      estimatedHours: templateTask.estimatedHours,
    });
    for (const [fieldName, value] of Object.entries(templateTask.customFieldValues)) {
      const fieldId = fieldIdByName[fieldName];
      if (fieldId) await setCustomFieldValue(task.id, fieldId, value);
    }
  }

  return project;
}
