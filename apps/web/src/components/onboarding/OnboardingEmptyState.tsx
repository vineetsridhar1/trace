import { useState } from "react";
import { GitBranch, Hash, Play, SlidersHorizontal } from "lucide-react";
import type { OnboardingStatus } from "../../hooks/useOnboardingStatus";
import { createQuickSession } from "../../lib/create-quick-session";
import { useOnboardingStore } from "../../stores/onboarding";
import { useUIStore } from "../../stores/ui";
import { Button } from "../ui/button";
import { BrowseChannelsDialog } from "../sidebar/BrowseChannelsDialog";
import { CreateChannelDialog } from "../sidebar/CreateChannelDialog";
import { CreateRepoDialog } from "../settings/CreateRepoDialog";

interface Props {
  status: OnboardingStatus;
}

export function OnboardingEmptyState({ status }: Props) {
  const invalidateRepos = useOnboardingStore((s) => s.invalidateRepos);
  const setActivePage = useUIStore((s) => s.setActivePage);
  const setSettingsInitialTab = useUIStore((s) => s.setSettingsInitialTab);
  const [repoOpen, setRepoOpen] = useState(false);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [browseChannelsOpen, setBrowseChannelsOpen] = useState(false);

  const primaryAction = getPrimaryAction(status);

  function handlePrimaryAction() {
    switch (primaryAction) {
      case "repo":
        setRepoOpen(true);
        return;
      case "channel":
        setCreateChannelOpen(true);
        return;
      case "defaults":
        setSettingsInitialTab("session-defaults");
        setActivePage("settings");
        return;
      case "session":
        if (status.firstCodingChannelId) {
          void createQuickSession(status.firstCodingChannelId);
          return;
        }
        setCreateChannelOpen(true);
        return;
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-deep">
      <div className="grid gap-6 p-5 md:grid-cols-[1fr_18rem] md:p-6">
        <div className="min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-elevated text-foreground">
            <GitBranch size={18} />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-foreground">
            Start your first Trace workspace
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
            Connect a repository, create a coding channel, choose defaults, and start a session.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button onClick={handlePrimaryAction}>{primaryActionLabel(primaryAction)}</Button>
            <Button variant="outline" onClick={() => setBrowseChannelsOpen(true)}>
              Browse channels
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
          <SetupTile done={status.hasRepo} icon={GitBranch} label="Repository" />
          <SetupTile done={status.hasChannel} icon={Hash} label="Channel" />
          <SetupTile done={status.hasSessionDefaults} icon={SlidersHorizontal} label="Defaults" />
          <SetupTile done={status.hasSession} icon={Play} label="Session" />
        </div>
      </div>

      <CreateRepoDialog
        open={repoOpen}
        onOpenChange={setRepoOpen}
        hideTrigger
        onCreated={invalidateRepos}
      />
      <CreateChannelDialog open={createChannelOpen} onOpenChange={setCreateChannelOpen} />
      <BrowseChannelsDialog
        open={browseChannelsOpen}
        onOpenChange={setBrowseChannelsOpen}
        hideTrigger
      />
    </div>
  );
}

type PrimaryAction = "repo" | "channel" | "defaults" | "session";

function getPrimaryAction(status: OnboardingStatus): PrimaryAction {
  if (!status.hasRepo) return "repo";
  if (!status.hasChannel) return "channel";
  if (!status.hasSessionDefaults) return "defaults";
  return "session";
}

function primaryActionLabel(action: PrimaryAction) {
  switch (action) {
    case "repo":
      return "Link repository";
    case "channel":
      return "Create channel";
    case "defaults":
      return "Choose defaults";
    case "session":
      return "Create session";
  }
}

function SetupTile({
  done,
  icon: Icon,
  label,
}: {
  done: boolean;
  icon: typeof GitBranch;
  label: string;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-md border border-border bg-background/60 px-3 py-2">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
          done ? "bg-emerald-500/10 text-emerald-500" : "bg-surface-elevated text-muted-foreground"
        }`}
      >
        <Icon size={15} />
      </span>
      <span className="min-w-0 truncate text-sm font-medium text-foreground">{label}</span>
    </div>
  );
}
