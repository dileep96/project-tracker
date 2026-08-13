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
  { label: "Board", icon: Kanban, comingSoon: true },
  { label: "Gantt", icon: ChartBarHorizontal, comingSoon: true },
  { label: "Calendar", icon: CalendarBlank, comingSoon: true },
  { label: "Timeline", icon: ClockCountdown, comingSoon: true },
  { label: "Dashboard", icon: ChartPieSlice, comingSoon: true },
];
