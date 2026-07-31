import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { Channel, Project } from "@trace/gql";
import { useHomeComposerStore } from "../../stores/home-composer";
import type { ChatEditorHandle } from "../chat/ChatEditor";
import { SessionComposer } from "../session/SessionComposer";
import { ComposerInputOptions } from "../session/SessionInputOptions";
import type { InteractionMode } from "../session/interactionModes";
import { getReasoningEffortsForTool } from "../session/modelOptions";
import type { ToolOptionValue } from "../session/picker/pickerShared";
import { HomeBridgePicker } from "./HomeBridgePicker";
import { HomeChannelPicker, type HomeChannelTarget } from "./HomeChannelPicker";
import { HomeComposerTextSync } from "./home-composer-sync";
import { HomeDesignPicker } from "./HomeDesignPicker";
import { HomeDesignSystemPicker } from "./HomeDesignSystemPicker";
import type { HomeCreatableKind } from "./home-kinds";

export function HomeComposer({
  prompt,
  kind,
  channels,
  projects,
  channelTargetKey,
  selectedChannelRepoId,
  bridgeId,
  designSystemVersionId,
  designSessionGroupId,
  tool,
  model,
  reasoningEffort,
  mode,
  submitting,
  onPromptChange,
  onChannelTargetChange,
  onBridgeChange,
  onDesignSystemChange,
  onDesignChange,
  onToolChange,
  onModelChange,
  onReasoningEffortChange,
  onModeChange,
  onSubmit,
}: {
  prompt: string;
  kind: HomeCreatableKind;
  channels: Channel[];
  projects: Project[];
  channelTargetKey: string | null;
  selectedChannelRepoId: string | null;
  bridgeId: string | null;
  designSystemVersionId: string | null;
  designSessionGroupId: string | null;
  tool: ToolOptionValue;
  model: string | null;
  reasoningEffort: string | null;
  mode: InteractionMode;
  submitting: boolean;
  onPromptChange: (prompt: string) => void;
  onChannelTargetChange: (target: HomeChannelTarget | null) => void;
  onBridgeChange: (bridgeId: string | null) => void;
  onDesignSystemChange: (versionId: string | null) => void;
  onDesignChange: (designId: string | null) => void;
  onToolChange: (tool: ToolOptionValue) => void;
  onModelChange: (model: string) => void;
  onReasoningEffortChange: (effort: string) => void;
  onModeChange: (mode: InteractionMode) => void;
  onSubmit: (prompt: string, mode: InteractionMode) => Promise<boolean>;
}) {
  const editorRef = useRef<ChatEditorHandle>(null);
  const textSyncRef = useRef(new HomeComposerTextSync(prompt));
  const focusRequest = useHomeComposerStore((state) => state.focusRequest);
  const prefill = useHomeComposerStore((state) => state.prefill);
  const consumePrefill = useHomeComposerStore((state) => state.consumePrefill);
  const codingSetupComplete = kind !== "coding" || (!!channelTargetKey && !!bridgeId);
  const canSubmit = prompt.trim().length > 0 && codingSetupComplete && !submitting;
  const effortOptions = getReasoningEffortsForTool(tool);

  useEffect(() => {
    editorRef.current?.focus();
  }, [focusRequest]);

  useEffect(() => {
    if (!prefill) return;
    textSyncRef.current.recordEditorText(prefill.text);
    editorRef.current?.setText(prefill.text);
    consumePrefill(prefill.id);
    requestAnimationFrame(() => editorRef.current?.focus());
  }, [consumePrefill, prefill]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const externalText = textSyncRef.current.takeExternalText(prompt);
    if (externalText !== null) editor.setText(externalText);
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
          const created = await onSubmit(text, mode);
          if (!created) throw new Error("Session creation failed");
        }}
        onChange={(text) => {
          textSyncRef.current.recordEditorText(text);
          onPromptChange(text);
        }}
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
            compact
            betweenModeAndTool={
              <>
                <HomeChannelPicker
                  channels={channels}
                  projects={projects}
                  selectedKey={channelTargetKey}
                  disabled={kind !== "coding"}
                  onSelect={onChannelTargetChange}
                />
                <HomeBridgePicker
                  selectedBridgeId={bridgeId}
                  repoId={selectedChannelRepoId}
                  tool={tool}
                  disabled={kind !== "coding"}
                  onSelect={onBridgeChange}
                />
              </>
            }
            afterTool={
              kind === "design" ? (
                <HomeDesignSystemPicker
                  selectedVersionId={designSystemVersionId}
                  disabled={submitting}
                  onSelect={onDesignSystemChange}
                />
              ) : (
                <HomeDesignPicker
                  selectedDesignId={designSessionGroupId}
                  disabled={submitting}
                  onSelect={onDesignChange}
                />
              )
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
