import { useCallback, useEffect, useState } from "react";
import { AVAILABLE_RUNTIMES_QUERY, useEntityField } from "@trace/client-core";
import type { SessionRuntimeInstance } from "@trace/gql";
import { Plus } from "lucide-react";
import { client } from "../../lib/urql";
import { createQuickSession, quickSessionUnavailableMessage } from "../../lib/create-quick-session";
import { cn } from "../../lib/utils";
import { usePreferencesStore } from "../../stores/preferences";
import { SessionEnvironmentSelect } from "./SessionEnvironmentSelect";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

interface AvailableRuntimesQueryResult {
  availableRuntimes?: SessionRuntimeInstance[];
}

export function StartSessionDialog({ channelId }: { channelId: string }) {
  const channelRepo = useEntityField("channels", channelId, "repo") as
    | { id?: string }
    | null
    | undefined;
  const channelRepoId = channelRepo?.id;
  const defaultTool = usePreferencesStore((s) => s.defaultTool ?? "claude_code");
  const [repoNotLinked, setRepoNotLinked] = useState(false);
  const [checkingRepoLink, setCheckingRepoLink] = useState(false);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (selectedEnvironmentId) {
      setRepoNotLinked(false);
      setCheckingRepoLink(false);
      return () => {
        cancelled = true;
      };
    }

    if (!channelRepoId) {
      setRepoNotLinked(false);
      setCheckingRepoLink(false);
      return () => {
        cancelled = true;
      };
    }

    setRepoNotLinked(false);
    setCheckingRepoLink(true);
    client
      .query<AvailableRuntimesQueryResult>(
        AVAILABLE_RUNTIMES_QUERY,
        { tool: defaultTool },
        { requestPolicy: "network-only" },
      )
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        setCheckingRepoLink(false);
        if (result.error) {
          setRepoNotLinked(false);
          return;
        }
        const runtimes = result.data?.availableRuntimes ?? [];
        const connected = runtimes.filter((r) => r.connected && r.hostingMode === "local");
        setRepoNotLinked(
          connected.length > 0 &&
            !connected.some((r) => r.registeredRepoIds.includes(channelRepoId)),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setCheckingRepoLink(false);
          setRepoNotLinked(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [channelRepoId, defaultTool, selectedEnvironmentId]);

  const disabled = checkingRepoLink || repoNotLinked;

  const handleClick = useCallback(() => {
    if (disabled) return;
    createQuickSession(channelId, { environmentId: selectedEnvironmentId });
  }, [channelId, disabled, selectedEnvironmentId]);

  const tooltip = checkingRepoLink
    ? "Checking repo link..."
    : repoNotLinked
      ? quickSessionUnavailableMessage("repo_not_linked")
      : "New session (⌘N)";

  return (
    <div className="flex items-center gap-1">
      <SessionEnvironmentSelect
        tool={defaultTool}
        selectedEnvironmentId={selectedEnvironmentId}
        onSelectionChange={setSelectedEnvironmentId}
      />
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <button
            onClick={handleClick}
            disabled={disabled}
            className={cn(
              "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground",
              "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            )}
            title={tooltip}
            aria-label={tooltip}
          >
            <Plus size={16} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
}
