import { useCallback, useEffect, useState } from "react";
import { AVAILABLE_RUNTIMES_QUERY, useEntityField } from "@trace/client-core";
import type { SessionRuntimeInstance } from "@trace/gql";
import { Plus } from "lucide-react";
import { client } from "../../lib/urql";
import {
  createQuickSession,
  quickSessionUnavailableMessage,
  type RuntimeUnavailableReason,
} from "../../lib/create-quick-session";
import { cn } from "../../lib/utils";
import { usePreferencesStore } from "../../stores/preferences";
import {
  CLOUD_SESSION_TARGET,
  SessionEnvironmentSelect,
  type SessionEnvironmentSelection,
} from "./SessionEnvironmentSelect";
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
  const [localUnavailableReason, setLocalUnavailableReason] =
    useState<RuntimeUnavailableReason | null>(null);
  const [checkingRepoLink, setCheckingRepoLink] = useState(false);
  const [environmentOptionsLoaded, setEnvironmentOptionsLoaded] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [selectedEnvironment, setSelectedEnvironment] =
    useState<SessionEnvironmentSelection | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (
      selectedTarget === null ||
      selectedTarget === CLOUD_SESSION_TARGET ||
      selectedEnvironment?.adapterType !== "local"
    ) {
      setLocalUnavailableReason(null);
      setCheckingRepoLink(false);
      return () => {
        cancelled = true;
      };
    }

    const selectedRuntimeInstanceId = selectedEnvironment.runtimeInstanceId;
    setLocalUnavailableReason(null);
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
          setLocalUnavailableReason(null);
          return;
        }
        const runtimes = result.data?.availableRuntimes ?? [];
        const connected = runtimes.filter((r) => r.connected && r.hostingMode === "local");
        if (selectedRuntimeInstanceId) {
          const selectedRuntime = connected.find((r) => r.id === selectedRuntimeInstanceId);
          setLocalUnavailableReason(
            !selectedRuntime
              ? "no_local_runtime"
              : channelRepoId && !selectedRuntime.registeredRepoIds.includes(channelRepoId)
                ? "repo_not_linked"
                : null,
          );
          return;
        }
        setLocalUnavailableReason(
          connected.length === 0
            ? "no_local_runtime"
            : channelRepoId && !connected.some((r) => r.registeredRepoIds.includes(channelRepoId))
              ? "repo_not_linked"
              : null,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setCheckingRepoLink(false);
          setLocalUnavailableReason(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [channelRepoId, defaultTool, selectedEnvironment, selectedTarget]);

  const disabled = !environmentOptionsLoaded || checkingRepoLink || !!localUnavailableReason;

  const handleTargetChange = useCallback(
    (target: string | null, environment?: SessionEnvironmentSelection | null) => {
      setSelectedTarget(target);
      setSelectedEnvironment(environment ?? null);
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
    : !environmentOptionsLoaded
      ? "Loading environments..."
      : localUnavailableReason
      ? quickSessionUnavailableMessage(localUnavailableReason)
      : "New session (⌘N)";

  return (
    <div className="flex items-center gap-1">
      <SessionEnvironmentSelect
        tool={defaultTool}
        selectedTarget={selectedTarget}
        onSelectionChange={handleTargetChange}
        onOptionsLoadedChange={setEnvironmentOptionsLoaded}
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
