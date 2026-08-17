import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_PRIORITIES, type AutomationAction, type AutomationActionType, type AutomationConditionField, type AutomationRule, type AutomationTriggerType, type TaskPriority } from "@/lib/db";
import { generateId } from "@/lib/ids";
import { useTaskStatuses } from "@/hooks/use-task-statuses";
import { useCustomFieldDefs } from "@/hooks/use-custom-fields";
import { createAutomationRule, updateAutomationRule } from "@/lib/queries/automations";

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  statusChanged: "Status changes to…",
  taskOverdue: "Task becomes overdue",
  taskCreated: "Task is created",
};

const ACTION_LABELS: Record<AutomationActionType, string> = {
  changeStatus: "Change status",
  changePriority: "Change priority",
  addTag: "Add a tag",
  setAssignee: "Set assignee",
  setCustomField: "Set custom field value",
  notify: "Notify (log only)",
};

const CONDITION_FIELD_LABELS: Record<AutomationConditionField, string> = {
  priority: "Priority is",
  tag: "Has tag",
  assignee: "Assignee is",
};

interface ActionDraft {
  key: string;
  type: AutomationActionType;
  statusId: string;
  priority: TaskPriority;
  tag: string;
  assignee: string;
  customFieldId: string;
  customFieldValue: string;
  message: string;
}

function newActionDraft(): ActionDraft {
  return {
    key: generateId(),
    type: "changePriority",
    statusId: "",
    priority: "high",
    tag: "",
    assignee: "",
    customFieldId: "",
    customFieldValue: "",
    message: "",
  };
}

function draftFromAction(action: AutomationAction): ActionDraft {
  return {
    key: generateId(),
    type: action.type,
    statusId: action.statusId ?? "",
    priority: action.priority ?? "high",
    tag: action.tag ?? "",
    assignee: action.assignee ?? "",
    customFieldId: action.customFieldId ?? "",
    customFieldValue: action.customFieldValue ?? "",
    message: action.message ?? "",
  };
}

/** True once every draft that needs a value to be meaningful actually has one. */
function actionDraftIsValid(draft: ActionDraft): boolean {
  switch (draft.type) {
    case "changeStatus":
      return draft.statusId !== "";
    case "changePriority":
      return true;
    case "addTag":
      return draft.tag.trim() !== "";
    case "setAssignee":
      return true;
    case "setCustomField":
      return draft.customFieldId !== "";
    case "notify":
      return draft.message.trim() !== "";
    default:
      return false;
  }
}

function actionFromDraft(draft: ActionDraft): AutomationAction {
  switch (draft.type) {
    case "changeStatus":
      return { type: "changeStatus", statusId: draft.statusId };
    case "changePriority":
      return { type: "changePriority", priority: draft.priority };
    case "addTag":
      return { type: "addTag", tag: draft.tag.trim() };
    case "setAssignee":
      return { type: "setAssignee", assignee: draft.assignee.trim() };
    case "setCustomField":
      return { type: "setCustomField", customFieldId: draft.customFieldId, customFieldValue: draft.customFieldValue };
    case "notify":
      return { type: "notify", message: draft.message.trim() };
  }
}

interface AutomationRuleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Present when editing an existing rule; omitted when creating. */
  rule?: AutomationRule;
}

export function AutomationRuleForm({ open, onOpenChange, projectId, rule }: AutomationRuleFormProps) {
  const isEditing = !!rule;
  const statuses = useTaskStatuses(projectId);
  const customFields = useCustomFieldDefs(projectId);

  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>("statusChanged");
  const [triggerStatusId, setTriggerStatusId] = useState("");
  const [hasCondition, setHasCondition] = useState(false);
  const [conditionField, setConditionField] = useState<AutomationConditionField>("priority");
  const [conditionValue, setConditionValue] = useState("");
  const [actions, setActions] = useState<ActionDraft[]>([newActionDraft()]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(rule?.name ?? "");
    setEnabled(rule?.enabled ?? true);
    setTriggerType(rule?.trigger.type ?? "statusChanged");
    setTriggerStatusId(rule?.trigger.statusId ?? "");
    setHasCondition(rule?.condition !== null && rule?.condition !== undefined);
    setConditionField(rule?.condition?.field ?? "priority");
    setConditionValue(rule?.condition?.value ?? "");
    setActions(rule && rule.actions.length > 0 ? rule.actions.map(draftFromAction) : [newActionDraft()]);
  }, [open, rule]);

  function updateActionDraft(key: string, patch: Partial<ActionDraft>) {
    setActions((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const triggerValid = triggerType !== "statusChanged" || triggerStatusId !== "";
  const conditionValid = !hasCondition || conditionValue.trim() !== "";
  const actionsValid = actions.length > 0 && actions.every(actionDraftIsValid);
  const canSubmit = name.trim() !== "" && triggerValid && conditionValid && actionsValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const input = {
        projectId,
        name: name.trim(),
        enabled,
        trigger: triggerType === "statusChanged" ? { type: triggerType, statusId: triggerStatusId } : { type: triggerType },
        condition: hasCondition ? { field: conditionField, value: conditionValue.trim() } : null,
        actions: actions.map(actionFromDraft),
      };
      if (isEditing) {
        await updateAutomationRule(rule.id, input);
        toast.success("Automation updated");
      } else {
        await createAutomationRule(input);
        toast.success("Automation created");
      }
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit automation" : "New automation"}</DialogTitle>
            <DialogDescription>A trigger, an optional condition, and one or more actions this project can already do to a task.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex max-h-[60vh] flex-col gap-5 overflow-y-auto pr-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-name">Name</Label>
              <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Escalate urgent bugs" autoFocus />
            </div>

            {/* Trigger */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-trigger">When</Label>
              <div className="flex gap-2">
                <Select value={triggerType} onValueChange={(v) => setTriggerType(v as AutomationTriggerType)}>
                  <SelectTrigger id="rule-trigger" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TRIGGER_LABELS) as AutomationTriggerType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TRIGGER_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {triggerType === "statusChanged" && (
                  <Select value={triggerStatusId || undefined} onValueChange={setTriggerStatusId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a status" />
                    </SelectTrigger>
                    <SelectContent>
                      {(statuses ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {triggerType === "taskOverdue" && (
                <p className="text-xs text-muted-foreground">Checked on app startup and every minute the app stays open.</p>
              )}
            </div>

            {/* Condition */}
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="rule-has-condition">Only if… (optional)</Label>
                <Switch id="rule-has-condition" checked={hasCondition} onCheckedChange={setHasCondition} />
              </div>
              {hasCondition && (
                <div className="flex gap-2">
                  <Select value={conditionField} onValueChange={(v) => setConditionField(v as AutomationConditionField)}>
                    <SelectTrigger className="w-40 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CONDITION_FIELD_LABELS) as AutomationConditionField[]).map((f) => (
                        <SelectItem key={f} value={f}>
                          {CONDITION_FIELD_LABELS[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {conditionField === "priority" ? (
                    <Select value={conditionValue || undefined} onValueChange={setConditionValue}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a priority" />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p[0].toUpperCase() + p.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={conditionValue}
                      onChange={(e) => setConditionValue(e.target.value)}
                      placeholder={conditionField === "tag" ? "urgent" : "Alex Rivera"}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <Label>Do</Label>
              <div className="flex flex-col gap-2">
                {actions.map((draft) => (
                  <div key={draft.key} className="flex flex-col gap-2 rounded-md border border-border p-2.5">
                    <div className="flex items-center gap-2">
                      <Select value={draft.type} onValueChange={(v) => updateActionDraft(draft.key, { type: v as AutomationActionType })}>
                        <SelectTrigger size="sm" className="w-full text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ACTION_LABELS) as AutomationActionType[]).map((a) => (
                            <SelectItem key={a} value={a}>
                              {ACTION_LABELS[a]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Remove action"
                        disabled={actions.length === 1}
                        onClick={() => setActions((rows) => rows.filter((r) => r.key !== draft.key))}
                      >
                        <Trash />
                      </Button>
                    </div>

                    {draft.type === "changeStatus" && (
                      <Select value={draft.statusId || undefined} onValueChange={(v) => updateActionDraft(draft.key, { statusId: v })}>
                        <SelectTrigger size="sm" className="w-full text-xs">
                          <SelectValue placeholder="Choose a status" />
                        </SelectTrigger>
                        <SelectContent>
                          {(statuses ?? []).map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {draft.type === "changePriority" && (
                      <Select value={draft.priority} onValueChange={(v) => updateActionDraft(draft.key, { priority: v as TaskPriority })}>
                        <SelectTrigger size="sm" className="w-full text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_PRIORITIES.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p[0].toUpperCase() + p.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {draft.type === "addTag" && (
                      <Input
                        value={draft.tag}
                        onChange={(e) => updateActionDraft(draft.key, { tag: e.target.value })}
                        placeholder="Tag to add"
                        className="h-8 text-xs"
                      />
                    )}
                    {draft.type === "setAssignee" && (
                      <Input
                        value={draft.assignee}
                        onChange={(e) => updateActionDraft(draft.key, { assignee: e.target.value })}
                        placeholder="Leave blank to unassign"
                        className="h-8 text-xs"
                      />
                    )}
                    {draft.type === "setCustomField" && (
                      <div className="flex gap-2">
                        <Select value={draft.customFieldId || undefined} onValueChange={(v) => updateActionDraft(draft.key, { customFieldId: v })}>
                          <SelectTrigger size="sm" className="w-full text-xs">
                            <SelectValue placeholder="Field" />
                          </SelectTrigger>
                          <SelectContent>
                            {(customFields ?? []).map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={draft.customFieldValue}
                          onChange={(e) => updateActionDraft(draft.key, { customFieldValue: e.target.value })}
                          placeholder="Value"
                          className="h-8 text-xs"
                        />
                      </div>
                    )}
                    {draft.type === "notify" && (
                      <Input
                        value={draft.message}
                        onChange={(e) => updateActionDraft(draft.key, { message: e.target.value })}
                        placeholder="Message to log and toast"
                        className="h-8 text-xs"
                      />
                    )}
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setActions((rows) => [...rows, newActionDraft()])}>
                <Plus /> Add action
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div>
                <Label htmlFor="rule-enabled">Enabled</Label>
                <p className="text-xs text-muted-foreground">Disabled rules are kept but never fire.</p>
              </div>
              <Switch id="rule-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !canSubmit}>
              {isEditing ? "Save changes" : "Create automation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
