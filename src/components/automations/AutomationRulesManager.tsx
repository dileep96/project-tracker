import { useState } from "react";
import { toast } from "sonner";
import { Lightning, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { AutomationRuleForm } from "@/components/automations/AutomationRuleForm";
import { AutomationRunLogList } from "@/components/automations/AutomationRunLogList";
import { useAutomationRules } from "@/hooks/use-automations";
import { useTaskStatuses } from "@/hooks/use-task-statuses";
import { deleteAutomationRule, setAutomationRuleEnabled } from "@/lib/queries/automations";
import type { AutomationRule } from "@/lib/db";

const TRIGGER_SUMMARY: Record<string, string> = {
  taskOverdue: "Task becomes overdue",
  taskCreated: "Task is created",
};

function RuleSummary({ rule, statusName }: { rule: AutomationRule; statusName: (id: string) => string }) {
  const triggerText =
    rule.trigger.type === "statusChanged"
      ? `Status changes to "${statusName(rule.trigger.statusId ?? "")}"`
      : TRIGGER_SUMMARY[rule.trigger.type];
  const actionCount = rule.actions.length;
  return (
    <p className="text-xs text-muted-foreground">
      {triggerText} → {actionCount} action{actionCount === 1 ? "" : "s"}
      {rule.condition && " (conditional)"}
    </p>
  );
}

export function AutomationRulesManager({ projectId }: { projectId: string }) {
  const rules = useAutomationRules(projectId);
  const statuses = useTaskStatuses(projectId);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<AutomationRule | null>(null);

  const statusName = (id: string) => statuses?.find((s) => s.id === id)?.name ?? "a deleted status";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Trigger + optional condition + actions this app can already do to a task. Every firing writes a row to the
        run log below, shows a toast, and shows up in the notification center (bell icon) — a "notify" action's
        delivery IS that, not a separate email/push channel this app doesn't have.
      </p>

      {(rules ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
          <Lightning className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No automations yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rules!.map((rule) => (
            <div key={rule.id} className="flex items-center gap-3 rounded-md border border-border p-3">
              <Switch
                checked={rule.enabled}
                onCheckedChange={(checked) => setAutomationRuleEnabled(rule.id, checked)}
                aria-label={rule.enabled ? "Disable automation" : "Enable automation"}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{rule.name}</p>
                <RuleSummary rule={rule} statusName={statusName} />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Edit automation"
                onClick={() => {
                  setEditingRule(rule);
                  setFormOpen(true);
                }}
              >
                <PencilSimple />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Delete automation" onClick={() => setPendingDelete(rule)}>
                <Trash />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => {
          setEditingRule(undefined);
          setFormOpen(true);
        }}
      >
        <Plus /> New automation
      </Button>

      <AutomationRunLogList projectId={projectId} />

      <AutomationRuleForm open={formOpen} onOpenChange={setFormOpen} projectId={projectId} rule={editingRule} />

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.name}"?`}
        description="This stops the automation from ever firing again. Its past run-log entries are kept."
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteAutomationRule(pendingDelete.id);
          toast.success("Automation deleted");
        }}
      />
    </div>
  );
}
