import {
  CalendarBlank,
  ChartBarHorizontal,
  ChartPieSlice,
  ClockCountdown,
  FolderOpen,
  Kanban,
  ListChecks,
  type Icon,
} from "@phosphor-icons/react";

export interface NavItem {
  label: string;
  to?: string;
  icon: Icon;
  /** Present (and truthy) for views later phases will add — rendered disabled, never linked to a dead page. */
  comingSoon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Projects", to: "/projects", icon: FolderOpen },
  { label: "All Tasks", to: "/tasks", icon: ListChecks },
  // Board and Gantt are inherently per-project routes; these land on a project picker first
  // (see ProjectPickerPage) since the sidebar has no project context of its own.
  { label: "Board", to: "/board", icon: Kanban },
  { label: "Gantt", to: "/gantt", icon: ChartBarHorizontal },
  { label: "Calendar", to: "/calendar", icon: CalendarBlank },
  { label: "Timeline", to: "/timeline", icon: ClockCountdown },
  { label: "Dashboard", icon: ChartPieSlice, comingSoon: true },
];
