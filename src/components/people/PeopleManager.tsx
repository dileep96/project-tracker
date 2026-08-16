import { useState } from "react";
import { toast } from "sonner";
import { CalendarBlank, PencilSimple, Plus, Trash, UsersThree } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { PersonFormDialog } from "@/components/people/PersonFormDialog";
import { PersonTimeOffDialog } from "@/components/people/PersonTimeOffDialog";
import { usePeople } from "@/hooks/use-people";
import { deletePerson } from "@/lib/queries/people";
import type { Person } from "@/lib/db";

/** People + capacity/rate management — the Phase 4 input every workload, capacity, and cost number is computed from. */
export function PeopleManager() {
  const people = usePeople();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Person | undefined>(undefined);
  const [timeOffFor, setTimeOffFor] = useState<Person | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Person | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Name should match what's typed into a task's Assignee field — that's how workload and cost join up.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus /> Add person
        </Button>
      </div>

      {(people ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
          <UsersThree className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No people yet. Add someone to start tracking workload and cost.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {people!.map((person) => (
            <div key={person.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{person.name}</p>
                  {!person.active && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {person.weeklyCapacityHours}h/week · ${person.hourlyRate.toFixed(2)}/hr
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setTimeOffFor(person)}>
                <CalendarBlank /> Time off
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${person.name}`}
                onClick={() => {
                  setEditing(person);
                  setFormOpen(true);
                }}
              >
                <PencilSimple />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${person.name}`} onClick={() => setPendingDelete(person)}>
                <Trash />
              </Button>
            </div>
          ))}
        </div>
      )}

      <PersonFormDialog open={formOpen} onOpenChange={setFormOpen} person={editing} />
      <PersonTimeOffDialog open={timeOffFor !== null} onOpenChange={(open) => !open && setTimeOffFor(null)} person={timeOffFor} />

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.name}"?`}
        description="Removes them from capacity planning and the assignee picker. Their logged time entries stay on record, shown as a deleted person."
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deletePerson(pendingDelete.id);
          toast.success("Person deleted");
        }}
      />
    </div>
  );
}
