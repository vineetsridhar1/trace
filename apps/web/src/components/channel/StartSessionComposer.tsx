import { useCallback, useMemo, useState } from "react";
import { Cloud, GitBranch, Monitor, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useEntityField } from "@trace/client-core";
import { START_SESSION_MUTATION } from "@trace/client-core";
import { client } from "../../lib/urql";
import { navigateToSession } from "../../stores/ui";
import { usePreferencesStore } from "../../stores/preferences";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { ClaudeIcon, CodexIcon } from "../ui/tool-icons";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Check, Loader2 } from "lucide-react";
import { REPO_BRANCHES_QUERY } from "@trace/client-core";
import { cn } from "../../lib/utils";
import { getModelsForTool, getDefaultModel, getModelLabel } from "../session/modelOptions";

type Hosting = "cloud" | "local";

const optionTriggerClass =
  "h-7 w-auto cursor-pointer gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0";

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
      <div className="rounded-lg border border-border bg-surface-deep/40 px-3 pt-2.5 pb-2">
        <div className="mb-2 flex items-baseline gap-1.5 text-sm">
          <span className="font-semibold text-foreground">Start a session</span>
          {repoName && (
            <span className="text-muted-foreground">
              in <span className="text-foreground/80">{repoName}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg border border-border bg-surface-deep transition-colors focus-within:border-ring/50">
            <textarea
              value={prompt}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="Describe what to build, fix, or investigate... (⌘↵ to dispatch)"
              className="w-full resize-none border-none bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-0"
              disabled={dispatching}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canDispatch}
            onClick={() => void dispatch("plan")}
            className="my-0.5 shrink-0 self-stretch"
          >
            Plan first
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canDispatch}
            onClick={() => void dispatch("code")}
            className="my-0.5 shrink-0 self-stretch"
          >
            <Sparkles size={12} />
            Dispatch
          </Button>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-0.5 overflow-hidden whitespace-nowrap">
          {repo?.id && (
            <BranchInlineSelector
              repoId={repo.id}
              branch={branch || (baseBranch ?? "main")}
              onChange={setBranch}
            />
          )}
          <ToolModelInlineSelector
            tool={tool}
            model={model}
            onToolChange={setTool}
            onModelChange={setModel}
            modelOptions={modelOptions}
          />
          <HostingInlineSelector hosting={hosting} onChange={setHosting} />
        </div>
      </div>
    </div>
  );
}

function BranchInlineSelector({
  repoId,
  branch,
  onChange,
}: {
  repoId: string;
  branch: string;
  onChange: (branch: string) => void;
}) {
  const defaultBranch = useEntityField("repos", repoId, "defaultBranch") as string | undefined;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const displayValue = branch || defaultBranch || "main";

  const loadBranches = useCallback(() => {
    setLoading(true);
    client
      .query(REPO_BRANCHES_QUERY, { repoId, runtimeInstanceId: null, sessionGroupId: null })
      .toPromise()
      .then((result: { data?: { repoBranches?: string[] } }) => {
        setBranches(result.data?.repoBranches ?? []);
      })
      .catch(() => setBranches([]))
      .finally(() => setLoading(false));
  }, [repoId]);

  const filtered = search
    ? branches.filter((b: string) => b.toLowerCase().includes(search.toLowerCase()))
    : branches;

  return (
    <Popover
      open={open}
      onOpenChange={(o: boolean) => {
        setOpen(o);
        if (o) loadBranches();
        else setSearch("");
      }}
    >
      <PopoverTrigger
        className={cn(
          optionTriggerClass,
          "flex h-7 items-center gap-1.5 rounded-md px-2 hover:bg-surface-elevated",
        )}
      >
        <GitBranch size={12} />
        <span className="text-foreground/90">{displayValue}</span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="flex items-center border-b border-border px-2">
          <input
            autoFocus
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            placeholder="Search branches..."
            className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {!loading && filtered.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {branches.length === 0 ? "No branches" : "No matches"}
            </p>
          )}
          {filtered.map((b: string) => (
            <button
              key={b}
              type="button"
              onClick={() => {
                onChange(b);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                displayValue === b && "bg-accent/50",
              )}
            >
              <Check
                size={12}
                className={cn("shrink-0", displayValue === b ? "opacity-100" : "opacity-0")}
              />
              <span className="truncate">{b}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ToolModelInlineSelector({
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
    <>
      <Select
        value={tool}
        onValueChange={(v: string | null) => {
          if (!v) return;
          onToolChange(v);
          const fallback = getDefaultModel(v);
          if (fallback) onModelChange(fallback);
        }}
      >
        <SelectTrigger className={optionTriggerClass}>
          <SelectValue>
            <span className="flex items-center gap-1.5">
              <ToolIcon className="size-3.5" />
              {toolLabel}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="claude_code">
            <span className="flex items-center gap-1.5">
              <ClaudeIcon className="size-3.5" /> Claude Code
            </span>
          </SelectItem>
          <SelectItem value="codex">
            <span className="flex items-center gap-1.5">
              <CodexIcon className="size-3.5" /> Codex
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      {modelOptions.length > 0 && (
        <Select value={model || ""} onValueChange={(v: string | null) => v && onModelChange(v)}>
          <SelectTrigger className={optionTriggerClass}>
            <SelectValue>{modelLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {modelOptions.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </>
  );
}

function HostingInlineSelector({
  hosting,
  onChange,
}: {
  hosting: Hosting;
  onChange: (hosting: Hosting) => void;
}) {
  return (
    <Select value={hosting} onValueChange={(v: string | null) => v && onChange(v as Hosting)}>
      <SelectTrigger className={optionTriggerClass}>
        <SelectValue>
          <span className="flex items-center gap-1.5">
            {hosting === "cloud" ? (
              <>
                <Cloud size={12} className="text-sky-400" /> Cloud
              </>
            ) : (
              <>
                <Monitor size={12} className="text-green-400" /> Local
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
