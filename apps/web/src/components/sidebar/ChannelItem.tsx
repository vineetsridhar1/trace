import { Hash } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { SidebarMenuItem, SidebarMenuButton } from "../ui/sidebar";

export function ChannelItem({
  id,
  isActive,
  onClick,
}: {
  id: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const name = useEntityField("channels", id, "name");

  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={isActive} onClick={onClick} tooltip={name ?? ""}>
        <Hash size={16} className="opacity-50" />
        <span>{name}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** Channel item for the peek overlay (no SidebarMenuButton dependency) */
export function PeekChannelItem({
  id,
  isActive,
  onClick,
}: {
  id: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const name = useEntityField("channels", id, "name");

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors ${
        isActive
          ? "bg-surface-elevated text-foreground"
          : "text-muted-foreground hover:bg-surface-elevated/50 hover:text-foreground"
      }`}
    >
      <Hash size={16} className="shrink-0 opacity-50" />
      <span className="truncate">{name}</span>
    </button>
  );
}
