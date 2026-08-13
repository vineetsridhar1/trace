import { useMemo, useState } from "react";
import { LogIn } from "lucide-react";
import { toast } from "sonner";
import { useEntityField } from "@trace/client-core";
import { SessionStatusIndicator } from "../channel/SessionStatusIndicator";
import { useUIStore, type UIState } from "../../stores/ui";
import { joinChannel } from "../../lib/join-channel";
import { cn } from "../../lib/utils";
import { ActionTooltip } from "../ui/ActionTooltip";
import { useSidebarSessionStatusGroupsForChannel } from "./ChannelOwnedSessions";
import { sidebarNestedFullWidthRowClass } from "./sidebarItemStyles";

/**
 * A project the viewer opened through a shared link but has not joined. It sits
 * outside the member project tree, dimmed, so the current session stays visible
 * without implying membership.
 */
export function LinkedProjectSection({
  channelId,
  onChannelClick,
  onSessionClick,
}: {
  channelId: string;
  onChannelClick: (id: string) => void;
  onSessionClick: (channelId: string, sessionGroupId: string, sessionId: string | null) => void;
}) {
  const name = useEntityField("channels", channelId, "name");
  const activeChannelId = useUIStore((s: UIState) => s.activeChannelId);
  const activeSessionGroupId = useUIStore((s: UIState) => s.activeSessionGroupId);
  const statusGroups = useSidebarSessionStatusGroupsForChannel(channelId, "all");
  const records = useMemo(() => statusGroups.flatMap((group) => group.records), [statusGroups]);
  const [joining, setJoining] = useState(false);

  async function handleJoin() {
    setJoining(true);
    try {
      await joinChannel(channelId);
    } catch (error: unknown) {
      toast.error("Couldn't join this project", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="mt-1 space-y-0.5 border-t border-white/5 pl-3 pt-2 opacity-55 transition-opacity hover:opacity-100 focus-within:opacity-100">
      <ActionTooltip
        className="w-full"
        label={`You're not a member of ${name ?? "this project"}. You opened it from a link.`}
      >
        <button
          type="button"
          className={cn(
            "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-white/10",
            activeChannelId === channelId && !activeSessionGroupId && "bg-white/10",
          )}
          onClick={() => onChannelClick(channelId)}
        >
          <span className="truncate">{name}</span>
        </button>
      </ActionTooltip>

      {records.map((record) => (
        <button
          key={record.id}
          type="button"
          className={cn(
            "flex h-7 w-full cursor-pointer items-center gap-2 rounded-md px-1.5 text-left text-xs text-foreground transition-colors hover:bg-white/10",
            sidebarNestedFullWidthRowClass,
            activeSessionGroupId === record.id && "bg-white/10",
          )}
          onClick={() => onSessionClick(channelId, record.id, record.latestSessionId)}
        >
          <SessionStatusIndicator row={record.row} size={6} showDonePulse={false} />
          <span className="truncate">{record.name}</span>
        </button>
      ))}

      <button
        type="button"
        className={cn(
          "flex h-7 w-full cursor-pointer items-center gap-2 rounded-md px-1.5 text-left text-xs font-medium text-primary transition-colors hover:bg-white/10 disabled:cursor-default disabled:opacity-60",
          sidebarNestedFullWidthRowClass,
        )}
        disabled={joining}
        onClick={() => void handleJoin()}
      >
        <LogIn size={13} className="shrink-0" />
        <span className="truncate">{joining ? "Joining..." : "Join project"}</span>
      </button>
    </div>
  );
}
