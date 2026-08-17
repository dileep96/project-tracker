import { useState } from "react";
import { CheckCircle, EnvelopeOpen, LinkBreak, Lightning, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNotifications } from "@/hooks/use-notifications";
import { useAllTasks } from "@/hooks/use-tasks";
import { useAllComments } from "@/hooks/use-comments";
import { useAllAutomationRunLog } from "@/hooks/use-automations";
import { markNotificationRead, markNotificationsRead } from "@/lib/queries/notifications";
import { computeDigest } from "@/lib/analytics/notifications";
import { DAY_MS, startOfDay } from "@/lib/analytics/date-buckets";
import { cn } from "@/lib/utils";
import type { NotificationItem, NotificationKind } from "@/lib/analytics/notifications";
import type { RiskSeverity } from "@/lib/analytics/risks";

const timeFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const KIND_ICON: Record<NotificationKind, typeof LinkBreak> = {
  deadline: WarningCircle,
  automation: Lightning,
  risk: LinkBreak,
};

// Reuses the risk register's own severity color language (see RisksPage) rather than inventing a
// fourth urgency palette — "high" here means the same thing it means on /risks.
const URGENCY_BADGE: Record<RiskSeverity, string> = {
  high: "bg-health-red-bg text-health-red-fg",
  medium: "bg-health-amber-bg text-health-amber-fg",
  low: "bg-muted text-muted-foreground",
};

function NotificationRow({ item, onOpen }: { item: NotificationItem; onOpen: (item: NotificationItem) => void }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-muted/50",
        item.read ? "border-border/60" : "border-border bg-muted/30"
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("text-sm", item.read ? "text-foreground" : "font-medium")}>{item.title}</span>
          <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium", URGENCY_BADGE[item.urgency])}>
            {item.urgency}
          </span>
          {!item.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
      </div>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{timeFormatter.format(item.at)}</span>
    </button>
  );
}

function DigestTab() {
  const [period, setPeriod] = useState<"daily" | "weekly">("daily");
  const tasks = useAllTasks();
  const comments = useAllComments();
  const automationLog = useAllAutomationRunLog();
  const notifications = useNotifications();

  const loading = tasks === undefined || comments === undefined || automationLog === undefined || notifications === undefined;
  if (loading) return <div className="h-40 animate-pulse rounded-md bg-muted" />;

  const now = Date.now();
  const today = startOfDay(now);
  const periodStart = period === "daily" ? today : today - 6 * DAY_MS;
  const periodEnd = today + DAY_MS;
  const activeRisks = notifications!.filter((n) => n.kind === "risk").length;

  const digest = computeDigest(
    period === "daily" ? "Today" : "Last 7 days",
    periodStart,
    periodEnd,
    tasks!,
    comments!.map((c) => c.createdAt),
    automationLog!.map((e) => e.firedAt),
    activeRisks,
    now
  );

  const rows: Array<{ label: string; value: number }> = [
    { label: "Tasks created", value: digest.tasksCreated },
    { label: "Tasks completed", value: digest.tasksCompleted },
    { label: "Tasks due in period", value: digest.tasksDueInPeriod },
    { label: "Still overdue", value: digest.stillOverdue },
    { label: "Comments posted", value: digest.commentsPosted },
    { label: "Automations run", value: digest.automationsRun },
    { label: "Active risks (now)", value: digest.activeRisks },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        {(["daily", "weekly"] as const).map((p) => (
          <Button key={p} size="sm" variant={period === p ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setPeriod(p)}>
            {p === "daily" ? "Today" : "This week"}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-md border border-border p-2.5">
            <p className="font-mono text-lg font-semibold tabular-nums">{row.value}</p>
            <p className="text-xs text-muted-foreground">{row.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NotificationPanel({ onOpenNotification }: { onOpenNotification: (item: NotificationItem) => void }) {
  const notifications = useNotifications();
  const unreadCount = (notifications ?? []).filter((n) => !n.read).length;

  function open(item: NotificationItem) {
    void markNotificationRead(item.id, item.taskId ?? null);
    onOpenNotification(item);
  }

  function markAllRead() {
    if (!notifications) return;
    void markNotificationsRead(notifications.map((n) => ({ id: n.id, taskId: n.taskId ?? null })));
  }

  return (
    <Tabs defaultValue="notifications" className="w-full">
      <div className="flex items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="digest">Digest</TabsTrigger>
        </TabsList>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
            <EnvelopeOpen /> Mark all read
          </Button>
        )}
      </div>

      <TabsContent value="notifications" className="mt-2">
        {notifications === undefined ? (
          <div className="h-40 animate-pulse rounded-md bg-muted" />
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle className="size-5 text-health-green-fg" />
            <p className="text-sm text-muted-foreground">No notifications right now.</p>
          </div>
        ) : (
          <div className="flex max-h-96 flex-col gap-1.5 overflow-y-auto pr-0.5">
            {notifications.map((item) => (
              <NotificationRow key={item.id} item={item} onOpen={open} />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="digest" className="mt-2">
        <DigestTab />
      </TabsContent>
    </Tabs>
  );
}
