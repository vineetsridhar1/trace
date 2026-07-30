import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { Repo, SessionGroupKind } from "@trace/gql";
import { useHomeComposerStore } from "../../stores/home-composer";
import type { ChatEditorHandle } from "../chat/ChatEditor";
import { SessionComposer } from "../session/SessionComposer";
import { ComposerInputOptions } from "../session/SessionInputOptions";
import type { InteractionMode } from "../session/interactionModes";
import { getReasoningEffortsForTool } from "../session/modelOptions";
import type { ToolOptionValue } from "../session/picker/pickerShared";
import { HomeRepoPicker } from "./HomeRepoPicker";

export function HomeComposer({
  prompt,
  kind,
  repos,
  repoId,
  tool,
  model,
  reasoningEffort,
  mode,
  submitting,
  onPromptChange,
  onRepoChange,
  onToolChange,
  onModelChange,
  onReasoningEffortChange,
  onModeChange,
  onSubmit,
}: {
  prompt: string;
  kind: SessionGroupKind;
  repos: Repo[];
  repoId: string | null;
  tool: ToolOptionValue;
  model: string | null;
  reasoningEffort: string | null;
  mode: InteractionMode;
  submitting: boolean;
  onPromptChange: (prompt: string) => void;
  onRepoChange: (repoId: string | null) => void;
  onToolChange: (tool: ToolOptionValue) => void;
  onModelChange: (model: string) => void;
  onReasoningEffortChange: (effort: string) => void;
  onModeChange: (mode: InteractionMode) => void;
  onSubmit: (prompt: string, mode: InteractionMode) => Promise<boolean>;
}) {
  const editorRef = useRef<ChatEditorHandle>(null);
  const focusRequest = useHomeComposerStore((state) => state.focusRequest);
  const prefill = useHomeComposerStore((state) => state.prefill);
  const consumePrefill = useHomeComposerStore((state) => state.consumePrefill);
  const canSubmit = prompt.trim().length > 0 && !submitting;
  const effortOptions = getReasoningEffortsForTool(tool);

  useEffect(() => {
    editorRef.current?.focus();
  }, [focusRequest]);

  useEffect(() => {
    if (!prefill) return;
    editorRef.current?.setText(prefill.text);
    consumePrefill(prefill.id);
    requestAnimationFrame(() => editorRef.current?.focus());
  }, [consumePrefill, prefill]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.getText() === prompt) return;
    editor.setText(prompt);
  }, [prompt]);

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <SessionComposer
        editorRef={editorRef}
        mode={mode}
        placeholder="Describe what you want to make…"
        disabled={submitting}
        submitDisabled={!canSubmit}
        onSubmit={async (_html, text) => {
          onPromptChange(text);
          const created = await onSubmit(text, mode);
          if (!created) throw new Error("Session creation failed");
        }}
        onChange={(text) => onPromptChange(text)}
        onShiftTab={() => onModeChange(mode)}
        onAttachClick={() =>
          toast.info("Start the session first, then add attachments in its composer.")
        }
        controls={
          <ComposerInputOptions
            mode={mode}
            tool={tool}
            model={model}
            reasoningEffort={reasoningEffort}
            reasoningEffortOptions={effortOptions}
            disabled={submitting}
            betweenModeAndTool={
              <HomeRepoPicker
                repos={repos}
                selectedRepoId={repoId}
                disabled={kind !== "coding"}
                onSelect={onRepoChange}
              />
            }
            onModeChange={onModeChange}
            onToolChange={onToolChange}
            onModelChange={onModelChange}
            onReasoningEffortChange={onReasoningEffortChange}
          />
        }
      />
    </div>
  );
}
