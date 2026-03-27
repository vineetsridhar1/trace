import { useCallback, useEffect, useState } from "react";
import { gql } from "@urql/core";
import { AnimatePresence, motion } from "framer-motion";
import { Cloud, Monitor } from "lucide-react";
import type { CodingTool, SessionRuntimeInstance } from "@trace/gql";
import { useEntityStore, useEntityField } from "../../stores/entity";
import { client } from "../../lib/urql";
import { AVAILABLE_RUNTIMES_QUERY } from "../../lib/mutations";
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
import { getModelsForTool, getDefaultModel, getModelLabel } from "./modelOptions";
import { CLOUD_RUNTIME_ID } from "./RuntimeSelector";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { ClaudeIcon, CodexIcon } from "../ui/tool-icons";
import { cn } from "../../lib/utils";

const TOOL_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
};

function getToolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool;
}

const UPDATE_SESSION_CONFIG_MUTATION = gql`
  mutation UpdateSessionConfig($sessionId: ID!, $tool: CodingTool, $model: String, $hosting: HostingMode, $runtimeInstanceId: ID) {
    updateSessionConfig(sessionId: $sessionId, tool: $tool, model: $model, hosting: $hosting, runtimeInstanceId: $runtimeInstanceId) {
      id
      tool
      model
      hosting
      connection {
        state
        runtimeInstanceId
        runtimeLabel
      }
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

  const handleRuntimeChange = useCallback(async (value: string) => {
    if (value === currentRuntimeValue) return;
    const newIsCloud = value === CLOUD_RUNTIME_ID;
    const rt = runtimes.find((r) => r.id === value);

    // Optimistically update the entity store
    useEntityStore.getState().patch("sessions", sessionId, {
      hosting: newIsCloud ? "cloud" : (rt?.hostingMode ?? "local"),
      connection: {
        ...(connection ?? {}),
        runtimeInstanceId: newIsCloud ? null : value,
        runtimeLabel: newIsCloud ? null : (rt?.label ?? null),
        state: "connecting",
      },
    });

    await client.mutation(UPDATE_SESSION_CONFIG_MUTATION, {
      sessionId,
      hosting: newIsCloud ? "cloud" : undefined,
      runtimeInstanceId: newIsCloud ? undefined : value,
    }).toPromise();
  }, [sessionId, currentRuntimeValue, runtimes, connection]);

  const modeConfig = MODE_CONFIG[mode];
  const ModeIcon = modeConfig.icon;

  return (
    <div className="mt-2 flex items-center gap-1 overflow-hidden whitespace-nowrap">
      <Select value={currentTool} onValueChange={handleToolChange} disabled={isActive}>
        <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
          <SelectValue>
            <span className="flex items-center gap-1.5">
              {currentTool === "claude_code" ? <ClaudeIcon className="size-3.5" /> : <CodexIcon className="size-3.5" />}
              {getToolLabel(currentTool)}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="claude_code">
            <span className="flex items-center gap-1.5"><ClaudeIcon className="size-3.5" /> Claude Code</span>
          </SelectItem>
          <SelectItem value="codex">
            <span className="flex items-center gap-1.5"><CodexIcon className="size-3.5" /> Codex</span>
          </SelectItem>
        </SelectContent>
      </Select>
      {modelOptions.length > 0 && (
        <Select value={currentModel ?? ""} onValueChange={handleModelChange} disabled={isActive}>
          <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
            <SelectValue>{currentModel ? getModelLabel(currentModel) : ""}</SelectValue>
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
              <span className="flex items-center gap-1">
                {isCloud ? (
                  <><Cloud size={12} className="text-blue-400" /> Cloud</>
                ) : (
                  <><Monitor size={12} className="text-green-400" /> {runtimeLabel ?? "Local"}</>
                )}
              </span>
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
        <Tooltip>
          <TooltipTrigger className="flex h-7 items-center px-2 text-muted-foreground">
            {isCloud ? (
              <Cloud size={12} className="text-blue-400" />
            ) : (
              <Monitor size={12} className="text-green-400" />
            )}
          </TooltipTrigger>
          <TooltipContent>{isCloud ? "Cloud" : (runtimeLabel ?? "Local")}</TooltipContent>
        </Tooltip>
      )}
      <button
        type="button"
        onClick={() => onModeChange(mode)}
        disabled={isActive}
        className={cn(
          "relative flex h-7 items-center gap-1.5 overflow-hidden rounded-lg border px-2 text-[11px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          modeConfig.style,
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={mode}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1.5"
          >
            <ModeIcon size={14} className="shrink-0" />
            {modeConfig.label}
          </motion.span>
        </AnimatePresence>
      </button>
    </div>
  );
}
