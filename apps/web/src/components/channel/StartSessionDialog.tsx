import { useCallback, useEffect, useState } from "react";
import { AVAILABLE_RUNTIMES_QUERY, useEntityField } from "@trace/client-core";
import type { AgentEnvironment, SessionRuntimeInstance } from "@trace/gql";
import { Plus } from "lucide-react";
import { client } from "../../lib/urql";
import { createQuickSession, quickSessionUnavailableMessage } from "../../lib/create-quick-session";
import { cn } from "../../lib/utils";
import { usePreferencesStore } from "../../stores/preferences";
import { CLOUD_SESSION_TARGET, SessionEnvironmentSelect } from "./SessionEnvironmentSelect";
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
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [selectedEnvironmentAdapter, setSelectedEnvironmentAdapter] = useState<
    AgentEnvironment["adapterType"] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    if (
      selectedTarget === null ||
      selectedTarget === CLOUD_SESSION_TARGET ||
      selectedEnvironmentAdapter !== "local"
    ) {
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
  }, [channelRepoId, defaultTool, selectedEnvironmentAdapter, selectedTarget]);

  const disabled = checkingRepoLink || repoNotLinked;

  const handleTargetChange = useCallback(
    (target: string | null, environment?: Pick<AgentEnvironment, "adapterType"> | null) => {
      setSelectedTarget(target);
      setSelectedEnvironmentAdapter(environment?.adapterType ?? null);
    },
    [],
  );

  const handleClick = useCallback(() => {
    if (disabled) return;
    createQuickSession(
      channelId,
      selectedTarget === null
        ? {}
        : selectedTarget === CLOUD_SESSION_TARGET
          ? { hosting: "cloud" }
          : { environmentId: selectedTarget },
    );
  }, [channelId, disabled, selectedTarget]);

  const tooltip = checkingRepoLink
    ? "Checking repo link..."
    : repoNotLinked
      ? quickSessionUnavailableMessage("repo_not_linked")
      : "New session (⌘N)";

  return (
    <div className="flex items-center gap-1">
      <SessionEnvironmentSelect
        tool={defaultTool}
        selectedTarget={selectedTarget}
        onSelectionChange={handleTargetChange}
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
