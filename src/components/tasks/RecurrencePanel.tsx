import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRecurrenceRule } from "@/hooks/use-task-detail";
import { clearRecurrence, setRecurrence } from "@/lib/queries/tasks";
import { generateRecurringInstancesForTask, RECURRENCE_LOOKAHEAD_DAYS } from "@/lib/recurrence";
import type { RecurrenceEndType, RecurrenceFrequency } from "@/lib/db";

const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  daily: "Day",
  weekly: "Week",
  monthly: "Month",
  yearly: "Year",
};

export function RecurrencePanel({
  taskId,
  isRecurring,
  hasDate,
}: {
  taskId: string;
  isRecurring: boolean;
  /** Whether the task has a start or due date to generate future occurrences from. */
  hasDate: boolean;
}) {
  const rule = useRecurrenceRule(taskId);
  const [endDateDraft, setEndDateDraft] = useState("");

  /** Generates upcoming instances right away so toggling recurrence on shows a result immediately, instead of waiting for the next app load's background pass (see src/lib/recurrence.ts). */
  async function generateNow() {
    const created = await generateRecurringInstancesForTask(taskId);
    if (created > 0) toast.success(`Generated ${created} upcoming occurrence${created === 1 ? "" : "s"}`);
  }

  async function enable() {
    await setRecurrence(taskId, { frequency: "weekly", interval: 1, endType: "never" });
    await generateNow();
  }

  async function update(patch: Partial<{ frequency: RecurrenceFrequency; interval: number; endType: RecurrenceEndType; endDate: number | null; endCount: number | null }>) {
    if (!rule) return;
    await setRecurrence(taskId, {
      frequency: patch.frequency ?? rule.frequency,
      interval: patch.interval ?? rule.interval,
      endType: patch.endType ?? rule.endType,
      endDate: "endDate" in patch ? patch.endDate ?? null : rule.endDate,
      endCount: "endCount" in patch ? patch.endCount ?? null : rule.endCount,
    });
    await generateNow();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Make recurring</p>
          <p className="text-xs text-muted-foreground">
            Auto-generates upcoming copies of this task up to {RECURRENCE_LOOKAHEAD_DAYS} days ahead.
          </p>
        </div>
        <Switch
          checked={isRecurring}
          onCheckedChange={(checked) => (checked ? enable() : clearRecurrence(taskId))}
        />
      </div>

      {isRecurring && !hasDate && (
        <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          Set a start or due date above to generate occurrences — there's nothing to repeat from yet.
        </p>
      )}

      {isRecurring && rule && (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Every</span>
            <Input
              type="number"
              min={1}
              defaultValue={rule.interval}
              className="h-8 w-16 text-sm"
              onBlur={(e) => update({ interval: Math.max(1, Number(e.target.value) || 1) })}
            />
            <Select value={rule.frequency} onValueChange={(v) => update({ frequency: v as RecurrenceFrequency })}>
              <SelectTrigger size="sm" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FREQUENCY_LABELS) as RecurrenceFrequency[]).map((f) => (
                  <SelectItem key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                    {rule.interval > 1 ? "s" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Ends</Label>
            <Select value={rule.endType} onValueChange={(v) => update({ endType: v as RecurrenceEndType })}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Never</SelectItem>
                <SelectItem value="onDate">On a date</SelectItem>
                <SelectItem value="afterCount">After a number of times</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {rule.endType === "onDate" && (
            <Input
              type="date"
              value={endDateDraft || (rule.endDate ? new Date(rule.endDate).toISOString().slice(0, 10) : "")}
              onChange={(e) => {
                setEndDateDraft(e.target.value);
                const [y, m, d] = e.target.value.split("-").map(Number);
                update({ endDate: e.target.value ? new Date(y, m - 1, d).getTime() : null });
              }}
              className="h-8 text-sm"
            />
          )}

          {rule.endType === "afterCount" && (
            <Input
              type="number"
              min={1}
              defaultValue={rule.endCount ?? 1}
              className="h-8 w-24 text-sm"
              onBlur={(e) => update({ endCount: Math.max(1, Number(e.target.value) || 1) })}
            />
          )}
        </div>
      )}
    </div>
  );
}
