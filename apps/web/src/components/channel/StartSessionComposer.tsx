import { useCallback, useMemo, useState } from "react";
import { Cloud, Monitor, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useEntityField } from "@trace/client-core";
import { START_SESSION_MUTATION } from "@trace/client-core";
import { client } from "../../lib/urql";
import { navigateToSession } from "../../stores/ui";
import { usePreferencesStore } from "../../stores/preferences";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { ClaudeIcon, CodexIcon } from "../ui/tool-icons";
import { BranchCombobox } from "./BranchCombobox";
import { getModelsForTool, getDefaultModel, getModelLabel } from "../session/modelOptions";

type Hosting = "cloud" | "local";

export function StartSessionComposer({ channelId }: { channelId: string }) {
  const repo = useEntityField("channels", channelId, "repo") as
    | { id: string; name: string }
    | null
    | undefined;
  const baseBranch = useEntityField("channels", channelId, "baseBranch") as
    | string
    | null
    | undefined;

  const prefTool = usePreferencesStore((s) => s.defaultTool) ?? "claude_code";
  const prefModel = usePreferencesStore((s) => s.defaultModel);
  const prefHosting = usePreferencesStore((s) => s.defaultHosting);

  const [prompt, setPrompt] = useState("");
  const [tool, setTool] = useState<string>(prefTool);
  const [model, setModel] = useState<string>(prefModel ?? getDefaultModel(prefTool) ?? "");
  const [branch, setBranch] = useState<string>(baseBranch ?? "");
  const [hosting, setHosting] = useState<Hosting>(prefHosting === "cloud" ? "cloud" : "local");
  const [dispatching, setDispatching] = useState(false);

  const modelOptions = useMemo(() => getModelsForTool(tool), [tool]);
  const repoName = repo?.name;
  const canDispatch = prompt.trim().length > 0 && !dispatching;

  const dispatch = useCallback(
    async (mode: "code" | "plan") => {
      if (!canDispatch) return;
      setDispatching(true);
      try {
        const result = await client
          .mutation(START_SESSION_MUTATION, {
            input: {
              tool,
              model: model || undefined,
              hosting,
              deferRuntimeSelection: hosting === "local",
              channelId,
              repoId: repo?.id,
              branch: branch || undefined,
              prompt: prompt.trim(),
              interactionMode: mode,
            },
          })
          .toPromise();

        if (result.error) {
          toast.error("Failed to start session", { description: result.error.message });
          return;
        }

        const session = result.data?.startSession;
        if (!session?.id || !session.sessionGroupId) {
          toast.error("Failed to start session", { description: "Server did not return IDs" });
          return;
        }

        setPrompt("");
        navigateToSession(channelId, session.sessionGroupId, session.id);
      } catch (err) {
        toast.error("Failed to start session", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setDispatching(false);
      }
    },
    [branch, canDispatch, channelId, hosting, model, prompt, repo?.id, tool],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void dispatch("code");
      }
    },
    [dispatch],
  );

  return (
    <div className="px-4 pt-3">
      <div className="rounded-lg border border-border bg-surface-deep/40 px-3 pt-3 pb-2">
        <div className="mb-1 flex items-baseline gap-1.5 text-sm">
          <span className="font-semibold text-foreground">Start a session</span>
          {repoName && (
            <span className="text-muted-foreground">
              in <span className="text-foreground/80">{repoName}</span>
            </span>
          )}
        </div>

        <textarea
          value={prompt}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder="Describe what to build, fix, or investigate... (⌘↵ to dispatch)"
          className="w-full resize-none border-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-0"
          disabled={dispatching}
        />

        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {repo?.id && (
              <BranchComboboxPill
                repoId={repo.id}
                branch={branch || (baseBranch ?? "main")}
                onChange={setBranch}
              />
            )}
            <ToolModelPill
              tool={tool}
              model={model}
              onToolChange={setTool}
              onModelChange={setModel}
              modelOptions={modelOptions}
            />
            <HostingPill hosting={hosting} onChange={setHosting} />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canDispatch}
              onClick={() => void dispatch("plan")}
            >
              Plan first
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canDispatch}
              onClick={() => void dispatch("code")}
            >
              <Sparkles size={12} />
              Dispatch
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const pillTriggerClass =
  "h-7 w-auto cursor-pointer gap-1.5 rounded-full border border-border/60 bg-surface-elevated/60 px-2.5 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0";

function BranchComboboxPill({
  repoId,
  branch,
  onChange,
}: {
  repoId: string;
  branch: string;
  onChange: (branch: string) => void;
}) {
  return (
    <div className="[&_button]:h-7 [&_button]:rounded-full [&_button]:border-border/60 [&_button]:bg-surface-elevated/60 [&_button]:px-2.5 [&_button]:text-[11px] [&_button]:text-muted-foreground hover:[&_button]:text-foreground">
      <BranchCombobox repoId={repoId} value={branch} onChange={onChange} />
    </div>
  );
}

function ToolModelPill({
  tool,
  model,
  onToolChange,
  onModelChange,
  modelOptions,
}: {
  tool: string;
  model: string;
  onToolChange: (tool: string) => void;
  onModelChange: (model: string) => void;
  modelOptions: ReadonlyArray<{ value: string; label: string }>;
}) {
  const ToolIcon = tool === "codex" ? CodexIcon : ClaudeIcon;
  const toolLabel = tool === "codex" ? "Codex" : "Claude";
  const modelLabel = model ? getModelLabel(model) : "";
  return (
    <Select
      value={model || ""}
      onValueChange={(v: string | null) => {
        if (!v) return;
        if (v.startsWith("__tool__:")) {
          const nextTool = v.slice("__tool__:".length);
          onToolChange(nextTool);
          const fallback = getDefaultModel(nextTool);
          if (fallback) onModelChange(fallback);
          return;
        }
        onModelChange(v);
      }}
    >
      <SelectTrigger className={pillTriggerClass}>
        <SelectValue>
          <span className="flex items-center gap-1.5">
            <ToolIcon className="size-3" />
            <span className="text-foreground/90">{toolLabel}</span>
            {modelLabel && (
              <>
                <span className="text-muted-foreground/60">·</span>
                <span>{modelLabel}</span>
              </>
            )}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__tool__:claude_code">
          <span className="flex items-center gap-1.5">
            <ClaudeIcon className="size-3.5" /> Claude Code
          </span>
        </SelectItem>
        <SelectItem value="__tool__:codex">
          <span className="flex items-center gap-1.5">
            <CodexIcon className="size-3.5" /> Codex
          </span>
        </SelectItem>
        {modelOptions.length > 0 && <div className="my-1 h-px bg-border" />}
        {modelOptions.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function HostingPill({
  hosting,
  onChange,
}: {
  hosting: Hosting;
  onChange: (hosting: Hosting) => void;
}) {
  return (
    <Select value={hosting} onValueChange={(v: string | null) => v && onChange(v as Hosting)}>
      <SelectTrigger className={pillTriggerClass}>
        <SelectValue>
          <span className="flex items-center gap-1.5">
            {hosting === "cloud" ? (
              <>
                <Cloud size={12} className="text-sky-400" />
                <span>Cloud</span>
              </>
            ) : (
              <>
                <Monitor size={12} className="text-green-400" />
                <span>Local</span>
              </>
            )}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="cloud">
          <span className="flex items-center gap-1.5">
            <Cloud size={12} className="text-sky-400" /> Cloud
          </span>
        </SelectItem>
        <SelectItem value="local">
          <span className="flex items-center gap-1.5">
            <Monitor size={12} className="text-green-400" /> Local
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
