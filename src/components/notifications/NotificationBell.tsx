import { useState } from "react";
import { Bell } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";
import { useNotifications } from "@/hooks/use-notifications";
import type { NotificationItem } from "@/lib/analytics/notifications";

/**
 * Bell icon + unread badge, opening the notification panel in a `Popover` (matching how other
 * compact anchored overlays behave in this codebase — see AGENTS.md) rather than a full-width
 * `Sheet`. Lives in both the desktop sidebar's bottom bar and the mobile header (see AppShell).
 */
export function NotificationBell({ onOpenNotification }: { onOpenNotification: (item: NotificationItem) => void }) {
  const [open, setOpen] = useState(false);
  const notifications = useNotifications();
  const unreadCount = (notifications ?? []).filter((n) => !n.read).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          className="relative"
        >
          <Bell />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-2rem)] sm:w-96">
        <NotificationPanel
          onOpenNotification={(item) => {
            setOpen(false);
            onOpenNotification(item);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
