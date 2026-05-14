import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cloud, GitBranch, Loader2, Monitor, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";
import {
  generateUUID,
  SEND_SESSION_MESSAGE_MUTATION,
  START_SESSION_MUTATION,
  useAuthStore,
  useEntityField,
} from "@trace/client-core";
import { client } from "../../lib/urql";
import { navigateToSession } from "../../stores/ui";
import { usePreferencesStore } from "../../stores/preferences";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { ClaudeIcon, CodexIcon } from "../ui/tool-icons";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Check } from "lucide-react";
import { REPO_BRANCHES_QUERY } from "@trace/client-core";
import { cn } from "../../lib/utils";
import {
  getDefaultModel,
  getDefaultReasoningEffort,
  getModelLabel,
  getModelsForTool,
  getReasoningEffortLabel,
  getReasoningEffortsForTool,
  type ReasoningEffortOption,
} from "../session/modelOptions";
import { ChatEditor, type ChatEditorHandle } from "../chat/ChatEditor";
import { ImageAttachmentBar, type FileAttachment } from "../session/ImageAttachmentBar";
import { uploadFile } from "../../lib/upload";
import {
  type InteractionMode,
  MODE_CONFIG,
  MODE_CYCLE,
  wrapPrompt,
} from "../session/interactionModes";

type Hosting = "cloud" | "local";

const MAX_ATTACHMENTS = 5;
const EFFORT_LINE_HEIGHT = 16;

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

  const [tool, setTool] = useState<string>(prefTool);
  const [model, setModel] = useState<string>(prefModel ?? getDefaultModel(prefTool) ?? "");
  const [reasoningEffort, setReasoningEffort] = useState<string>(
    getDefaultReasoningEffort(prefTool) ?? "",
  );
  const [branch, setBranch] = useState<string>(baseBranch ?? "");
  const [hosting, setHosting] = useState<Hosting>(prefHosting === "cloud" ? "cloud" : "local");
  const [mode, setMode] = useState<InteractionMode>("code");
  const [images, setImages] = useState<FileAttachment[]>([]);
  const [hasContent, setHasContent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);
  const editorRef = useRef<ChatEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const modelOptions = useMemo(() => getModelsForTool(tool), [tool]);
  const reasoningEffortOptions = useMemo(() => getReasoningEffortsForTool(tool), [tool]);
  const repoName = repo?.name;
  const canSend = (hasContent || images.length > 0) && !isSending;

  useEffect(() => {
    if (!branch && baseBranch) setBranch(baseBranch);
  }, [baseBranch, branch]);

  const cycleMode = useCallback(() => {
    setMode((prev) => {
      const idx = MODE_CYCLE.indexOf(prev);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    });
  }, []);

  const addAttachments = useCallback((files: File[]) => {
    if (isSendingRef.current) return;
    setImages((prev) => {
      const remaining = MAX_ATTACHMENTS - prev.length;
      if (remaining <= 0) return prev;
      const next: FileAttachment[] = files.slice(0, remaining).map((file) => ({
        id: generateUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        s3Key: null,
        uploading: false,
      }));
      return [...prev, ...next];
    });
  }, []);

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      addAttachments(Array.from(event.currentTarget.files ?? []));
      event.currentTarget.value = "";
    },
    [addAttachments],
  );

  const handleRemoveImage = useCallback((id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const handleToolChange = useCallback((newTool: string) => {
    setTool(newTool);
    const fallbackModel = getDefaultModel(newTool);
    setModel(fallbackModel ?? "");
    setReasoningEffort(getDefaultReasoningEffort(newTool) ?? "");
  }, []);

  const handleSubmit = useCallback(
    async (_html: string, text: string) => {
      if (isSendingRef.current) return;
      if (!text && images.length === 0) return;
      isSendingRef.current = true;
      setIsSending(true);

      const savedImages = [...images];
      const savedIds = new Set(savedImages.map((img) => img.id));
      try {
        let attachmentKeys: string[] = [];
        if (savedImages.length > 0) {
          setImages((prev) =>
            prev.map((img) => (savedIds.has(img.id) ? { ...img, uploading: true } : img)),
          );
          const orgId = useAuthStore.getState().activeOrgId;
          attachmentKeys = await Promise.all(
            savedImages.map((img) => uploadFile(img.file, orgId ?? undefined)),
          );
        }

        const startResult = await client
          .mutation(START_SESSION_MUTATION, {
            input: {
              tool,
              model: model || undefined,
              reasoningEffort: reasoningEffort || undefined,
              hosting: hosting === "cloud" ? "cloud" : undefined,
              deferRuntimeSelection: hosting === "local" ? true : undefined,
              channelId,
              repoId: repo?.id,
              branch: branch || undefined,
            },
          })
          .toPromise();

        if (startResult.error) {
          throw startResult.error;
        }

        const session = startResult.data?.startSession;
        if (!session?.id || !session.sessionGroupId) {
          throw new Error("Server did not return IDs");
        }

        const wrappedText = text ? wrapPrompt(mode, text) : "";
        const messageResult = await client
          .mutation(SEND_SESSION_MESSAGE_MUTATION, {
            sessionId: session.id,
            text: wrappedText,
            attachmentKeys: attachmentKeys.length > 0 ? attachmentKeys : undefined,
            interactionMode: mode === "code" ? undefined : mode,
          })
          .toPromise();

        if (messageResult.error) {
          throw messageResult.error;
        }

        setImages((prev) => prev.filter((img) => !savedIds.has(img.id)));
        for (const img of savedImages) URL.revokeObjectURL(img.previewUrl);
        navigateToSession(channelId, session.sessionGroupId, session.id);
      } catch (err) {
        setImages((prev) =>
          prev.map((img) => (savedIds.has(img.id) ? { ...img, uploading: false } : img)),
        );
        toast.error("Failed to start session", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
        throw err;
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
      }
    },
    [branch, channelId, hosting, images, mode, model, reasoningEffort, repo?.id, tool],
  );

  return (
    <div className={cn("px-4 pt-3 transition-colors", MODE_CONFIG[mode].containerBorder)}>
      <div className="rounded-lg border border-border bg-surface-deep/40 px-3 pt-2.5 pb-2">
        <div className="mb-2 flex items-baseline gap-1.5 text-sm">
          <span className="font-semibold text-foreground">Start a session</span>
          {repoName && (
            <span className="text-muted-foreground">
              in <span className="text-foreground/80">{repoName}</span>
            </span>
          )}
        </div>

        <ImageAttachmentBar attachments={images} onRemove={handleRemoveImage} />
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex-1 rounded-lg border bg-surface-deep transition-colors",
              MODE_CONFIG[mode].inputBorder,
            )}
          >
            <div className="session-editor">
              <ChatEditor
                ref={editorRef}
                onSubmit={handleSubmit}
                placeholder="What should the agent work on?"
                disabled={isSending}
                onShiftTab={cycleMode}
                onImagePaste={addAttachments}
                hasAttachments={images.length > 0}
                onChange={(nextText: string) => setHasContent(nextText.trim().length > 0)}
              />
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || images.length >= MAX_ATTACHMENTS}
            className="my-0.5 shrink-0 cursor-pointer self-stretch rounded-lg border border-border px-3 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title="Attach files"
          >
            <Paperclip size={16} />
          </button>
          <button
            type="button"
            onClick={() => void editorRef.current?.submit()}
            disabled={!canSend}
            className={cn(
              "my-0.5 shrink-0 cursor-pointer self-stretch rounded-lg px-3 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              MODE_CONFIG[mode].sendButton,
            )}
            title="Start session"
          >
            {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-0.5 overflow-hidden whitespace-nowrap">
          <ModeCycleButton mode={mode} onChange={cycleMode} disabled={isSending} />
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
            onToolChange={handleToolChange}
            onModelChange={setModel}
            modelOptions={modelOptions}
            disabled={isSending}
          />
          {reasoningEffortOptions.length > 0 && (
            <EffortCycleButton
              effort={reasoningEffort || reasoningEffortOptions[0]?.value || ""}
              options={reasoningEffortOptions}
              disabled={isSending}
              onChange={setReasoningEffort}
            />
          )}
          <HostingInlineSelector hosting={hosting} onChange={setHosting} />
        </div>
      </div>
    </div>
  );
}

function ModeCycleButton({
  mode,
  disabled,
  onChange,
}: {
  mode: InteractionMode;
  disabled?: boolean;
  onChange: () => void;
}) {
  const modeConfig = MODE_CONFIG[mode];
  const ModeIcon = modeConfig.icon;

  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={cn(
        "relative flex h-7 cursor-pointer items-center gap-1.5 overflow-hidden rounded-lg border px-2 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
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
  );
}

function EffortDots({ index, total }: { index: number; total: number }) {
  return (
    <span className="flex flex-col-reverse items-center gap-[2px]" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "block h-[3px] w-[3px] rounded-full transition-opacity duration-150",
            i <= index ? "bg-current opacity-100" : "bg-current opacity-30",
          )}
        />
      ))}
    </span>
  );
}

function EffortCycleButton({
  effort,
  options,
  disabled,
  onChange,
}: {
  effort: string;
  options: readonly ReasoningEffortOption[];
  disabled?: boolean;
  onChange: (effort: string) => void;
}) {
  const currentIndex = options.findIndex((option) => option.value === effort);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const currentOption = options[safeIndex];
  const currentLabel = currentOption?.label ?? getReasoningEffortLabel(effort);
  const nextOption = options[(safeIndex + 1) % options.length];

  return (
    <button
      type="button"
      onClick={() => {
        if (nextOption) onChange(nextOption.value);
      }}
      disabled={disabled || !nextOption}
      aria-label={`Reasoning effort: ${currentLabel}. Click to cycle.`}
      className={cn(
        "flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border-none bg-transparent px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <EffortDots index={safeIndex} total={options.length} />
      <span
        className="relative block min-w-[4.25rem] overflow-hidden text-left"
        style={{ height: EFFORT_LINE_HEIGHT }}
      >
        <span
          key={currentOption?.value ?? effort}
          className="block transition-opacity duration-150 ease-out"
          style={{ height: EFFORT_LINE_HEIGHT, lineHeight: `${EFFORT_LINE_HEIGHT}px` }}
        >
          {currentLabel}
        </span>
      </span>
    </button>
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
  disabled,
}: {
  tool: string;
  model: string;
  onToolChange: (tool: string) => void;
  onModelChange: (model: string) => void;
  modelOptions: ReadonlyArray<{ value: string; label: string }>;
  disabled?: boolean;
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
        }}
        disabled={disabled}
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
        <Select
          value={model || ""}
          onValueChange={(v: string | null) => v && onModelChange(v)}
          disabled={disabled}
        >
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
