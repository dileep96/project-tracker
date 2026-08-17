import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useAllTasks } from "@/hooks/use-tasks";
import { useProjects } from "@/hooks/use-projects";
import { useAllDependencies } from "@/hooks/use-task-detail";
import { useAllMilestones } from "@/hooks/use-milestones";
import { useAllTimeEntries } from "@/hooks/use-time-entries";
import { usePeople } from "@/hooks/use-people";
import { useAllAutomationRunLog } from "@/hooks/use-automations";
import { computeRiskRegister } from "@/lib/analytics/risks";
import {
  computeAutomationNotifications,
  computeDeadlineNotifications,
  computeNotifications,
  computeRiskNotifications,
  type NotificationItem,
} from "@/lib/analytics/notifications";

/**
 * The full notification list — deadline reminders, automation firings, and active risks, joined
 * with read-state and sorted unread-first. Pulls the exact same live-query set `RisksPage` already
 * assembles for `computeRiskRegister` (see that page) so risk detection never drifts between the
 * two surfaces. Heavier than a typical hook (7 live queries) but this app computes every analytics
 * surface live rather than maintaining a materialized view — same trade-off `RisksPage`/the
 * dashboard already make at this app's personal-project scale.
 */
export function useNotifications(): NotificationItem[] | undefined {
  const tasks = useAllTasks();
  const projects = useProjects();
  const dependencies = useAllDependencies();
  const milestones = useAllMilestones();
  const timeEntries = useAllTimeEntries();
  const people = usePeople();
  const automationLog = useAllAutomationRunLog();
  const readState = useLiveQuery(() => db.notificationReadState.toArray(), []);

  const loading =
    tasks === undefined ||
    projects === undefined ||
    dependencies === undefined ||
    milestones === undefined ||
    timeEntries === undefined ||
    people === undefined ||
    automationLog === undefined ||
    readState === undefined;

  return useMemo(() => {
    if (loading) return undefined;
    const now = Date.now();
    const projectsById = Object.fromEntries(projects!.map((p) => [p.id, p]));
    const risks = computeRiskRegister(tasks!, dependencies!, projects!, milestones!, timeEntries!, people!, now);
    return computeNotifications(
      computeDeadlineNotifications(tasks!, projectsById, now),
      computeAutomationNotifications(automationLog!),
      computeRiskNotifications(risks),
      readState!
    );
  }, [loading, tasks, projects, dependencies, milestones, timeEntries, people, automationLog, readState]);
}
