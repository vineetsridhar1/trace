import { useState } from "react";
import { Check, ChevronRight, Circle, GitBranch, Hash, Play } from "lucide-react";
import { motion } from "framer-motion";
import { useUIStore, type UIState } from "../../stores/ui";
import type { OnboardingStatus } from "../../hooks/useOnboardingStatus";
import { BrowseChannelsDialog } from "../sidebar/BrowseChannelsDialog";
import { CreateChannelDialog } from "../sidebar/CreateChannelDialog";
import { createQuickSession } from "../../lib/create-quick-session";

type IconComponent = typeof GitBranch;

interface Props {
  status: OnboardingStatus;
}

export function OnboardingChecklist({ status }: Props) {
  const setActivePage = useUIStore((s: UIState) => s.setActivePage);
  const setSettingsInitialTab = useUIStore((s: UIState) => s.setSettingsInitialTab);
  const [createOpen, setCreateOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);

  function openSettings(tab: string) {
    setSettingsInitialTab(tab);
    setActivePage("settings");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Get set up</h2>
        <span className="text-xs text-muted-foreground">
          {status.completedCount} of {status.totalCount} complete
        </span>
      </div>

      <div className="space-y-2">
        <SimpleRow
          done={status.hasRepo}
          icon={GitBranch}
          title="Connect a repository"
          description="Link a codebase to your organization."
          onClick={() => openSettings("repositories")}
        />

        <ChannelRow
          done={status.hasChannel}
          onBrowseClick={() => setBrowseOpen(true)}
          onCreateClick={() => setCreateOpen(true)}
        />

        <SimpleRow
          done={status.hasSession}
          icon={Play}
          title="Create your first session"
          description="Start a local coding session from a channel."
          onClick={() => {
            if (status.firstCodingChannelId) {
              void createQuickSession(status.firstCodingChannelId);
              return;
            }
            setCreateOpen(true);
          }}
        />
      </div>

      <CreateChannelDialog open={createOpen} onOpenChange={setCreateOpen} />
      <BrowseChannelsDialog open={browseOpen} onOpenChange={setBrowseOpen} hideTrigger />
    </div>
  );
}

interface SimpleRowProps {
  done: boolean;
  icon: IconComponent;
  title: string;
  description: string;
  onClick: () => void;
}

function SimpleRow({ done, icon: Icon, title, description, onClick }: SimpleRowProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-deep p-4 text-left transition-colors hover:bg-surface-hover"
    >
      <StatusIcon done={done} />
      <Icon size={16} className="shrink-0 text-muted-foreground" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
    </motion.button>
  );
}

interface ChannelRowProps {
  done: boolean;
  onBrowseClick: () => void;
  onCreateClick: () => void;
}

function ChannelRow({ done, onBrowseClick, onCreateClick }: ChannelRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-deep p-4">
      <StatusIcon done={done} />
      <Hash size={16} className="shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">Join or create a channel</p>
        <p className="text-xs text-muted-foreground">
          Channels are where you chat and run coding sessions.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <ChannelActionButton label="Browse" onClick={onBrowseClick} />
        <ChannelActionButton label="Create" onClick={onCreateClick} />
      </div>
    </div>
  );
}

function ChannelActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="rounded-md border border-border bg-surface-elevated px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover"
    >
      {label}
    </motion.button>
  );
}

function StatusIcon({ done }: { done: boolean }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center">
      {done ? (
        <Check size={18} className="text-emerald-500" />
      ) : (
        <Circle size={18} className="text-muted-foreground" />
      )}
    </span>
  );
}
