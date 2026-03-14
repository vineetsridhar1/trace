import { motion, AnimatePresence } from "framer-motion";
import { OrgSwitcher } from "./OrgSwitcher";
import { UserMenu } from "./UserMenu";
import { PeekChannelItem } from "./ChannelItem";
import { CreateChannelDialog } from "./CreateChannelDialog";

interface PeekOverlayProps {
  visible: boolean;
  channelIds: string[];
  activeChannelId: string | null;
  onChannelClick: (id: string) => void;
  onMouseLeave: () => void;
}

export function PeekOverlay({ visible, channelIds, activeChannelId, onChannelClick, onMouseLeave }: PeekOverlayProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          onMouseLeave={onMouseLeave}
          className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-surface-deep shadow-2xl shadow-black/50 ring-1 ring-border/50"
          style={{ margin: "8px", height: "calc(100% - 16px)", borderRadius: "12px" }}
        >
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl">
            <div className="border-b border-border">
              <OrgSwitcher large />
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              <div className="mb-1 flex items-center justify-between px-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Channels
                </span>
                <CreateChannelDialog />
              </div>
              <div className="flex flex-col gap-0.5">
                {channelIds.map((id) => (
                  <PeekChannelItem
                    key={id}
                    id={id}
                    isActive={id === activeChannelId}
                    onClick={() => onChannelClick(id)}
                  />
                ))}
                {channelIds.length === 0 && (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">No channels yet</p>
                )}
              </div>
            </div>
            <div className="border-t border-border">
              <UserMenu />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
