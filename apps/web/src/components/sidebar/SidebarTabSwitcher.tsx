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
      className={cn(
        "flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
        isPressed && "bg-white/[0.09] shadow-sm shadow-black/20",
      )}
      style={{ color: `color-mix(in srgb, #ffffff ${mix}%, #71717a)` }}
    >
      <Icon size={14} strokeWidth={2.15} />
      <span>{label}</span>
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
    <div
      className={cn(
        "flex items-center justify-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.04] p-1",
        className,
      )}
    >
      <SidebarTabButton
        icon={MessageCircleMore}
        label="Messages"
        selectedness={1 - tabProgress}
        isPressed={tabProgress < 0.5}
        onClick={() => onTabClick("dm")}
      />
      <SidebarTabButton
        icon={Building2}
        label="Channels"
        selectedness={tabProgress}
        isPressed={tabProgress >= 0.5}
        onClick={() => onTabClick("main")}
      />
    </div>
  );
}
