import { Building2, MessageCircleMore, type LucideIcon } from "lucide-react";
import { clamp, cn } from "../../lib/utils";
import { type SidebarTab } from "./sidebarTabs";

function SidebarTabButton({
  icon: Icon,
  label,
  selectedness,
  isPressed,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  selectedness: number;
  isPressed: boolean;
  onClick: () => void;
}) {
  const mix = clamp(selectedness, 0, 1) * 100;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isPressed}
      onClick={onClick}
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
      style={{ color: `color-mix(in srgb, #ffffff ${mix}%, #71717a)` }}
    >
      <Icon size={14} strokeWidth={2.15} />
    </button>
  );
}

export function SidebarTabSwitcher({
  tabProgress,
  onTabClick,
  className,
}: {
  tabProgress: number;
  onTabClick: (tab: SidebarTab) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-center gap-1", className)}>
      <SidebarTabButton
        icon={MessageCircleMore}
        label="Direct messages"
        selectedness={1 - tabProgress}
        isPressed={tabProgress < 0.5}
        onClick={() => onTabClick("dm")}
      />
      <SidebarTabButton
        icon={Building2}
        label="Organization channels"
        selectedness={tabProgress}
        isPressed={tabProgress >= 0.5}
        onClick={() => onTabClick("main")}
      />
    </div>
  );
}
