import { useCallback, useEffect, useState } from "react";
import { gql } from "@urql/core";
import { Cloud, Monitor } from "lucide-react";
import type { CodingTool, SessionRuntimeInstance } from "@trace/gql";
import { useEntityStore, useEntityField } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { client } from "../../lib/urql";
import {
  AVAILABLE_RUNTIMES_QUERY,
  START_SESSION_MUTATION,
  DELETE_SESSION_MUTATION,
} from "../../lib/mutations";
import { optimisticallyInsertSession } from "../../lib/optimistic-session";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  type InteractionMode,
  MODE_CONFIG,
} from "./interactionModes";
import { getModelsForTool, getDefaultModel } from "./modelOptions";
import { CLOUD_RUNTIME_ID } from "./RuntimeSelector";
import { cn } from "../../lib/utils";

const UPDATE_SESSION_CONFIG_MUTATION = gql`
  mutation UpdateSessionConfig($sessionId: ID!, $tool: CodingTool, $model: String) {
    updateSessionConfig(sessionId: $sessionId, tool: $tool, model: $model) {
      id
      tool
      model
    }
  }
`;

interface SessionInputOptionsProps {
  sessionId: string;
  mode: InteractionMode;
  onModeChange: (mode: InteractionMode) => void;
  isActive: boolean;
}

export function SessionInputOptions({
  sessionId,
  mode,
  onModeChange,
  isActive,
}: SessionInputOptionsProps) {
  const tool = useEntityField("sessions", sessionId, "tool") as string | undefined;
  const model = useEntityField("sessions", sessionId, "model") as string | undefined;
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as string | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | undefined;
  const connection = useEntityField("sessions", sessionId, "connection") as
    | Record<string, unknown>
    | null
    | undefined;

  const currentTool = tool ?? "claude_code";
  const modelOptions = getModelsForTool(currentTool);
  const currentModel = model ?? getDefaultModel(currentTool);
  const isNotStarted = agentStatus === "not_started";

  const runtimeLabel = connection && typeof connection === "object" && "runtimeLabel" in connection
    ? (connection.runtimeLabel as string)
    : null;
  const runtimeInstanceId = connection && typeof connection === "object" && "runtimeInstanceId" in connection
    ? (connection.runtimeInstanceId as string | null)
    : null;
  const isCloud = hosting === "cloud";
  const currentRuntimeValue = isCloud ? CLOUD_RUNTIME_ID : (runtimeInstanceId ?? CLOUD_RUNTIME_ID);

  // Fetch runtimes when not_started so user can switch
  const [runtimes, setRuntimes] = useState<SessionRuntimeInstance[]>([]);
  useEffect(() => {
    if (!isNotStarted) return;
    client
      .query(AVAILABLE_RUNTIMES_QUERY, { tool: currentTool })
      .toPromise()
      .then((result) => {
        const data = result.data?.availableRuntimes as SessionRuntimeInstance[] | undefined;
        if (data) setRuntimes(data);
      });
  }, [isNotStarted, currentTool]);

  const handleToolChange = useCallback(async (newTool: string | null) => {
    if (!newTool) return;
    const newDefault = getDefaultModel(newTool);
    useEntityStore.getState().patch("sessions", sessionId, { tool: newTool as CodingTool, model: newDefault ?? null });
    await client.mutation(UPDATE_SESSION_CONFIG_MUTATION, { sessionId, tool: newTool, model: newDefault }).toPromise();
  }, [sessionId]);

  const handleModelChange = useCallback(async (newModel: string | null) => {
    if (!newModel) return;
    useEntityStore.getState().patch("sessions", sessionId, { model: newModel });
    await client.mutation(UPDATE_SESSION_CONFIG_MUTATION, { sessionId, model: newModel }).toPromise();
  }, [sessionId]);

  // Switch runtime by creating a replacement session with the new runtime
  const handleRuntimeChange = useCallback(async (value: string) => {
    if (value === currentRuntimeValue) return;

    const session = useEntityStore.getState().sessions[sessionId];
    if (!session) return;

    const channelRaw = session.channel as { id: string } | null | undefined;
    const channelId = channelRaw?.id ?? null;
    const repoRaw = session.repo as { id: string } | null | undefined;
    const repoId = repoRaw?.id ?? undefined;
    const newIsCloud = value === CLOUD_RUNTIME_ID;

    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: {
          tool: currentTool,
          model: currentModel ?? undefined,
          hosting: newIsCloud ? "cloud" : undefined,
          runtimeInstanceId: newIsCloud ? undefined : value,
          channelId: channelId ?? undefined,
          repoId,
        },
      })
      .toPromise();

    const newSession = result.data?.startSession;
    if (!newSession?.id) return;

    const newGroupId = newSession.sessionGroupId;
    const rt = runtimes.find((r) => r.id === value);

    if (newGroupId) {
      optimisticallyInsertSession({
        id: newSession.id,
        sessionGroupId: newGroupId,
        tool: currentTool,
        model: currentModel ?? null,
        hosting: newIsCloud ? "cloud" : (rt?.hostingMode ?? "local"),
        channel: channelId ? { id: channelId } : null,
        repo: repoId ? { id: repoId } : null,
      });
      useUIStore.getState().openSessionTab(newGroupId, newSession.id);
      useUIStore.getState().setActiveSessionGroupId(newGroupId, newSession.id);
    }

    // Clean up the old session in the background
    client.mutation(DELETE_SESSION_MUTATION, { id: sessionId }).toPromise();
  }, [sessionId, currentRuntimeValue, currentTool, currentModel, runtimes]);

  const modeConfig = MODE_CONFIG[mode];
  const ModeIcon = modeConfig.icon;

  return (
    <div className="mt-2 flex items-center gap-1">
      <Select value={currentTool} onValueChange={handleToolChange} disabled={isActive}>
        <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="claude_code">Claude Code</SelectItem>
          <SelectItem value="codex">Codex</SelectItem>
        </SelectContent>
      </Select>
      {modelOptions.length > 0 && (
        <Select value={currentModel ?? ""} onValueChange={handleModelChange} disabled={isActive}>
          <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modelOptions.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {isNotStarted ? (
        <Select value={currentRuntimeValue} onValueChange={handleRuntimeChange}>
          <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
            <SelectValue>
              {isCloud ? (
                <span className="flex items-center gap-1"><Cloud size={12} className="text-blue-400" /> Cloud</span>
              ) : (
                <span className="flex items-center gap-1"><Monitor size={12} className="text-green-400" /> {runtimeLabel ?? "Local"}</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CLOUD_RUNTIME_ID}>
              <span className="flex items-center gap-1.5"><Cloud size={12} className="text-blue-400" /> Cloud</span>
            </SelectItem>
            {runtimes
              .filter((r) => r.hostingMode === "local" && r.connected)
              .map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  <span className="flex items-center gap-1.5"><Monitor size={12} className="text-green-400" /> {r.label}</span>
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="flex items-center gap-1 px-2 text-[11px] text-muted-foreground">
          {isCloud ? (
            <><Cloud size={12} className="shrink-0 text-blue-400" /> Cloud</>
          ) : (
            <><Monitor size={12} className="shrink-0 text-green-400" /> {runtimeLabel ?? "Local"}</>
          )}
        </span>
      )}
      <button
        type="button"
        onClick={() => onModeChange(mode)}
        disabled={isActive}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          modeConfig.style,
        )}
      >
        <ModeIcon size={14} className="shrink-0" />
        {modeConfig.label}
      </button>
    </div>
  );
}
