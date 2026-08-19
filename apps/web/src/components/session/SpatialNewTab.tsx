import { AppWindow, Globe, TerminalSquare } from "lucide-react";
import { ImportWorktreeAction } from "./ImportWorktreeAction";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@trace/client-core";
import { cn } from "../../lib/utils";
import { uploadFile } from "../../lib/upload";
import type { ChatEditorHandle } from "../chat/ChatEditor";
import { ComposerInputOptions } from "./SessionInputOptions";
import { SessionComposer } from "./SessionComposer";
import { MODE_CYCLE, type InteractionMode } from "./interactionModes";
import {
  getDefaultModel,
  getDefaultReasoningEffort,
  getReasoningEffortsForTool,
} from "./modelOptions";
import { normalizeTool, type ToolOptionValue } from "./picker/pickerShared";
import type { WorkspaceSurface } from "./SidebarPanel";
import { MAX_ATTACHMENTS } from "./useAddAttachments";
import { useHomeComposerAttachments } from "../home/useHomeComposerAttachments";

export interface SpatialNewChatInput {
  prompt: string;
  attachmentKeys: string[];
  imagePreviewUrls: string[];
  interactionMode: InteractionMode;
  tool: ToolOptionValue;
  model: string | null;
  reasoningEffort: string | null;
}

interface SpatialNewTabProps {
  sessionId: string | null;
  canStartChat: boolean;
  canStartTerminal: boolean;
  applicationUrl: string | null;
  defaultTool?: string | null;
  defaultModel?: string | null;
  defaultReasoningEffort?: string | null;
  onStartChat: (input: SpatialNewChatInput) => Promise<boolean>;
  onConvert: (surface: WorkspaceSurface) => void;
  onOpenApplication: (url: string) => void;
  onOpenApplications: () => void;
}

const quickStarts: Array<{
  id: "browser" | "terminal" | "application";
  surface: WorkspaceSurface;
  label: string;
  detail: string;
  icon: typeof Globe;
}> = [
  {
    id: "browser",
    surface: "browser",
    label: "Open browser",
    detail: "Preview a running app",
    icon: Globe,
  },
  {
    id: "terminal",
    surface: "terminal",
    label: "Open terminal",
    detail: "Start a shell or task",
    icon: TerminalSquare,
  },
  {
    id: "application",
    surface: "browser",
    label: "Open application",
    detail: "Open the running app preview",
    icon: AppWindow,
  },
];

export function SpatialNewTab({
  sessionId,
  canStartChat,
  canStartTerminal,
  applicationUrl,
  defaultTool,
  defaultModel,
  defaultReasoningEffort,
  onStartChat,
  onConvert,
  onOpenApplication,
  onOpenApplications,
}: SpatialNewTabProps) {
  const editorRef = useRef<ChatEditorHandle>(null);
  const organizationId = useAuthStore((state) => state.activeOrgId);
  const [hasContent, setHasContent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<InteractionMode>("code");
  const [tool, setTool] = useState<ToolOptionValue>(() =>
    normalizeTool(defaultTool ?? "claude_code"),
  );
  const [model, setModel] = useState<string | null>(
    () => defaultModel ?? getDefaultModel(normalizeTool(defaultTool ?? "claude_code")) ?? null,
  );
  const [reasoningEffort, setReasoningEffort] = useState<string | null>(
    () =>
      defaultReasoningEffort ??
      getDefaultReasoningEffort(normalizeTool(defaultTool ?? "claude_code")) ??
      null,
  );
  const { attachments, addAttachments, removeAttachment, setUploading, clearAttachments } =
    useHomeComposerAttachments();
  const effortOptions = getReasoningEffortsForTool(tool);

  useEffect(() => {
    const frame = requestAnimationFrame(() => editorRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const cycleMode = () => {
    const index = MODE_CYCLE.indexOf(mode);
    setMode(MODE_CYCLE[(index + 1) % MODE_CYCLE.length]);
  };

  const selectTool = (nextTool: ToolOptionValue) => {
    setTool(nextTool);
    setModel(getDefaultModel(nextTool) ?? null);
    setReasoningEffort(getDefaultReasoningEffort(nextTool) ?? null);
  };

  const submit = async (_html: string, prompt: string) => {
    if (!canStartChat || submitting || (!prompt.trim() && attachments.length === 0)) return;
    setSubmitting(true);
    const savedAttachments = [...attachments];
    const attachmentIds = new Set(savedAttachments.map((attachment) => attachment.id));
    try {
      setUploading(attachmentIds, true);
      const attachmentKeys = await Promise.all(
        savedAttachments.map((attachment) =>
          uploadFile(attachment.file, organizationId ?? undefined),
        ),
      );
      const started = await onStartChat({
        prompt: prompt.trim(),
        attachmentKeys,
        imagePreviewUrls: savedAttachments.map((attachment) => attachment.previewUrl),
        interactionMode: mode,
        tool,
        model,
        reasoningEffort,
      });
      if (!started) {
        setUploading(attachmentIds, false);
        return;
      }
      clearAttachments();
    } catch (error) {
      setUploading(attachmentIds, false);
      toast.error(error instanceof Error ? error.message : "Failed to start chat");
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-background px-8 py-10">
      <div className="w-full max-w-3xl">
        <h1 className="text-center text-xl font-semibold tracking-tight text-foreground">
          What do you want to work on?
        </h1>

        <div className="mt-7">
          <SessionComposer
            className="shadow-xl shadow-black/20"
            editorRef={editorRef}
            mode={mode}
            placeholder="Ask Codex to build, fix, or explain…"
            disabled={!canStartChat || submitting}
            submitDisabled={
              !canStartChat || submitting || (!hasContent && attachments.length === 0)
            }
            attachmentDisabled={attachments.length >= MAX_ATTACHMENTS}
            attachments={attachments}
            onSubmit={submit}
            onChange={(text) => setHasContent(text.trim().length > 0)}
            onShiftTab={cycleMode}
            onPasteFiles={addAttachments}
            onFilesSelected={addAttachments}
            onRemoveAttachment={removeAttachment}
            controls={
              <ComposerInputOptions
                mode={mode}
                tool={tool}
                model={model}
                reasoningEffort={reasoningEffort}
                reasoningEffortOptions={effortOptions}
                disabled={!canStartChat || submitting}
                alwaysExpandToolModel
                onModeChange={cycleMode}
                onToolChange={selectTool}
                onModelChange={setModel}
                onReasoningEffortChange={setReasoningEffort}
              />
            }
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
          {quickStarts.map((item) => {
            const Icon = item.icon;
            const disabled = item.surface === "terminal" && !canStartTerminal;
            const applicationUnavailable = item.id === "application" && !applicationUrl;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (applicationUnavailable) {
                    onOpenApplications();
                    return;
                  }
                  if (item.id === "application" && applicationUrl) {
                    onOpenApplication(applicationUrl);
                    return;
                  }
                  onConvert(item.surface);
                }}
                disabled={disabled}
                className={cn(
                  "group rounded-xl border border-border bg-surface-mid p-3 text-left transition-colors hover:border-muted-foreground/50 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40",
                  applicationUnavailable && "opacity-40",
                )}
              >
                <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <Icon size={13} className="text-muted-foreground group-hover:text-foreground" />
                  {item.label}
                </span>
                <span className="mt-1.5 block text-[10px] leading-4 text-muted-foreground">
                  {applicationUnavailable
                    ? "Start an application to open its preview"
                    : item.detail}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-center">
          <ImportWorktreeAction sessionId={sessionId} />
        </div>
      </div>
    </div>
  );
}
