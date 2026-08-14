import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import { toast } from "sonner";
import { normalizeTool } from "../session/picker/pickerShared";
import { createHomeSession } from "../../lib/create-home-session";
import { homeComposerDraftScope, useHomeComposerStore } from "../../stores/home-composer";
import { useHomeDataStore } from "../../stores/home-data";
import { HomeComposer } from "../home/HomeComposer";
import { useHomeComposerAttachments } from "../home/useHomeComposerAttachments";
import { uploadFile } from "../../lib/upload";
import { buildHomeChannelTargets } from "../home/HomeChannelPicker";
import { HomeFirstRunSparks } from "../home/HomeFirstRunSparks";
import { HomeHeader } from "../home/HomeHeader";
import { DEFAULT_HOME_KIND } from "../home/HomeKindIcon";
import { HomeKindSelector } from "../home/HomeKindSelector";
import type { HomeCreatableKind } from "../home/home-kinds";
import { HomeLedgerError } from "../home/HomeLedgerError";
import { HomeLedgerSkeleton } from "../home/HomeLedgerSkeleton";
import { HomeWorkLedger } from "../home/HomeWorkLedger";
import { HomeCreationsGrid } from "../home/HomeCreationsGrid";
import { useHomeCreations } from "../home/useHomeCreations";
import { useHomeWorkData } from "../home/useHomeWorkData";
import { MODE_CYCLE, type InteractionMode } from "../session/interactionModes";
import { getDefaultModel, getDefaultReasoningEffort } from "../session/modelOptions";
import type { ToolOptionValue } from "../session/picker/pickerShared";

export function HomeView({ mode = "home" }: { mode?: "home" | "create" }) {
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const activeOrgId = useAuthStore((state: AuthState) => state.activeOrgId);
  const currentUserId = useAuthStore((state: AuthState) => state.user?.id);
  const defaultTool = useAuthStore((state: AuthState) => state.user?.defaultSessionTool);
  const draftScope = homeComposerDraftScope(currentUserId, activeOrgId);
  const prompt = useHomeComposerStore((state) => state.drafts[draftScope] ?? "");
  const setDraft = useHomeComposerStore((state) => state.setDraft);
  const clearDraft = useHomeComposerStore((state) => state.clearDraft);
  const retryHomeData = useHomeDataStore((state) => state.requestRetry);
  const channelsTable = useEntityStore((state) => state.channels);
  const projectsTable = useEntityStore((state) => state.projects);
  const channels = useMemo(() => Object.values(channelsTable), [channelsTable]);
  const projects = useMemo(() => Object.values(projectsTable), [projectsTable]);
  const channelTargets = useMemo(
    () => buildHomeChannelTargets(channels, projects),
    [channels, projects],
  );
  const work = useHomeWorkData();
  useHomeCreations(activeOrgId);
  const [selectedChannelTargetKey, setSelectedChannelTargetKey] = useState<string | null>(null);
  const [selectedBridgeId, setSelectedBridgeId] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<HomeCreatableKind | null>(null);
  const [bridgeLoading, setBridgeLoading] = useState(true);
  const [tool, setTool] = useState<ToolOptionValue>(() =>
    normalizeTool(defaultTool ?? "claude_code"),
  );
  const [model, setModel] = useState<string | null>(() => getDefaultModel(tool) ?? null);
  const [reasoningEffort, setReasoningEffort] = useState<string | null>(
    () => getDefaultReasoningEffort(tool) ?? null,
  );
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("code");
  const [submitting, setSubmitting] = useState(false);
  const { attachments, addAttachments, removeAttachment, setUploading, clearAttachments } =
    useHomeComposerAttachments();
  const homeDataReady = useHomeDataStore(
    (state) =>
      state.organizationId === activeOrgId &&
      state.codingStatus === "ready" &&
      state.generatedStatus === "ready",
  );
  const homeDataFailed = useHomeDataStore(
    (state) =>
      state.organizationId === activeOrgId &&
      (state.codingStatus === "error" || state.generatedStatus === "error"),
  );
  const activeKind = selectedKind ?? DEFAULT_HOME_KIND;
  const selectedChannelTarget =
    channelTargets.find((target) => target.key === selectedChannelTargetKey) ?? null;
  const selectedChannelRepoId = selectedChannelTarget?.repoId ?? null;
  const isCreateMode = mode === "create";

  useEffect(() => {
    if (!isCreateMode) return;
    let scrollFrame: number | undefined;
    const focusFrame = requestAnimationFrame(() => {
      useHomeComposerStore.getState().requestFocus();
      scrollFrame = requestAnimationFrame(() => scrollViewportRef.current?.scrollTo({ top: 0 }));
    });
    return () => {
      cancelAnimationFrame(focusFrame);
      if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
    };
  }, [isCreateMode]);

  useEffect(() => {
    setSelectedChannelTargetKey(null);
    setSelectedBridgeId(null);
    setSelectedKind(null);
    setBridgeLoading(true);
    setInteractionMode("code");
  }, [draftScope]);

  const updatePrompt = (nextPrompt: string) => {
    setDraft(draftScope, nextPrompt);
  };

  const selectTool = (nextTool: ToolOptionValue) => {
    setTool(nextTool);
    setSelectedBridgeId(null);
    setModel(getDefaultModel(nextTool) ?? null);
    setReasoningEffort(getDefaultReasoningEffort(nextTool) ?? null);
  };

  const cycleMode = (currentMode: InteractionMode) => {
    const index = MODE_CYCLE.indexOf(currentMode);
    setInteractionMode(MODE_CYCLE[(index + 1) % MODE_CYCLE.length]);
  };

  const submit = async (
    submittedPrompt: string = prompt,
    submittedInteractionMode: InteractionMode = interactionMode,
  ): Promise<boolean> => {
    if (!submittedPrompt.trim() || submitting) return false;
    setSubmitting(true);
    try {
      const savedAttachments = [...attachments];
      const attachmentIds = new Set(savedAttachments.map((attachment) => attachment.id));
      let attachmentKeys: string[] = [];
      if (savedAttachments.length > 0) {
        setUploading(attachmentIds, true);
        try {
          attachmentKeys = await Promise.all(
            savedAttachments.map((attachment) =>
              uploadFile(attachment.file, activeOrgId ?? undefined),
            ),
          );
        } catch (error) {
          setUploading(attachmentIds, false);
          toast.error(error instanceof Error ? error.message : "Failed to upload file");
          return false;
        }
      }
      const created = await createHomeSession({
        prompt: submittedPrompt,
        attachmentKeys,
        kind: activeKind,
        tool,
        model,
        reasoningEffort,
        interactionMode: submittedInteractionMode,
        channel: selectedChannelTarget?.channel ?? null,
        projectId: selectedChannelTarget?.projectId ?? null,
        repoId: selectedChannelTarget?.repoId ?? null,
        runtimeInstanceId:
          activeKind === "general" || activeKind === "coding" ? selectedBridgeId : null,
      });
      if (created) {
        clearAttachments();
        clearDraft(draftScope);
        setSelectedChannelTargetKey(null);
        setSelectedBridgeId(null);
        setSelectedKind(null);
        setBridgeLoading(true);
      } else if (attachmentIds.size > 0) {
        setUploading(attachmentIds, false);
      }
      return created;
    } finally {
      setSubmitting(false);
    }
  };

  const firstRun = homeDataReady && work.totalOwnedOrParticipating === 0;
  const showIntro = isCreateMode || firstRun;
  const people = work.items.flatMap((item) => (item.owner ? [item.owner] : []));

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--th-surface-mid)]">
      <HomeHeader people={people} title={isCreateMode ? "New session" : "Home"} />
      <div
        ref={scrollViewportRef}
        className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      >
        <div className="pointer-events-none absolute left-1/2 top-[-70px] h-[420px] w-[min(900px,100vw)] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--th-accent)_8%,transparent),transparent_70%)]" />
        <main
          className={`relative mx-auto flex min-h-full w-full flex-col px-4 pb-7 sm:px-6 ${
            showIntro ? "pt-16 sm:pt-[68px]" : "pt-8 sm:pt-11"
          }`}
        >
          <h1 className="text-center text-[22px] font-semibold tracking-[-0.01em] text-[var(--th-heading)] sm:text-2xl">
            What can I help with?
          </h1>
          {showIntro && (
            <p className="mt-1.5 text-center text-[13px] text-[var(--th-muted)]">
              Start a conversation — the agent can evolve it or create focused sessions when needed.
            </p>
          )}
          <div className="mt-7">
            <HomeComposer
              prompt={prompt}
              kind={activeKind}
              channelTargetKey={selectedChannelTargetKey}
              selectedChannelRepoId={selectedChannelRepoId}
              bridgeId={selectedBridgeId}
              tool={tool}
              model={model}
              reasoningEffort={reasoningEffort}
              mode={interactionMode}
              submitting={submitting}
              bridgeLoading={bridgeLoading}
              attachments={attachments}
              onPromptChange={updatePrompt}
              onPasteFiles={addAttachments}
              onFilesSelected={addAttachments}
              onRemoveAttachment={removeAttachment}
              onChannelTargetChange={(target) => {
                setSelectedChannelTargetKey(target?.key ?? null);
                setSelectedBridgeId(null);
                if (activeKind === "general") setBridgeLoading(true);
              }}
              onBridgeChange={setSelectedBridgeId}
              onBridgeLoadingChange={setBridgeLoading}
              onToolChange={selectTool}
              onModelChange={setModel}
              onReasoningEffortChange={setReasoningEffort}
              onModeChange={cycleMode}
              onSubmit={submit}
            />
            <HomeKindSelector
              selectedKind={selectedKind}
              onSelect={(kind) => {
                setSelectedKind(kind);
                if (kind === null || kind === "general") setBridgeLoading(true);
                if (kind && kind !== "general" && kind !== "coding") {
                  setSelectedChannelTargetKey(null);
                  setSelectedBridgeId(null);
                }
              }}
            />
          </div>

          {isCreateMode &&
          prompt.trim().length > 0 ? (
            <p className="mt-5 flex items-center justify-center gap-2 text-[13px] text-[var(--th-muted)]">
              <span className="size-1.5 rounded-full bg-[var(--th-success)]" />
              <span>Ready — this opens a {selectedKind ? activeKind : "general AI"} session</span>
            </p>
          ) : !isCreateMode && !homeDataReady ? (
            homeDataFailed ? (
              <>
                <HomeLedgerError onRetry={retryHomeData} />
                {work.items.length > 0 && <HomeWorkLedger items={work.items} />}
              </>
            ) : (
              <HomeLedgerSkeleton />
            )
          ) : !isCreateMode && firstRun ? (
            <HomeFirstRunSparks
              onUsePrompt={(starter) => useHomeComposerStore.getState().requestFocus(starter)}
            />
          ) : !isCreateMode ? (
            <HomeWorkLedger items={work.items} />
          ) : null}

          <HomeCreationsGrid />

          <p className="mt-auto pt-8 text-center text-[11px] text-[var(--th-faint)]">
            <span className="hidden sm:inline">⌘N New session · </span>⌘K Search · ⌘J Latest session
          </p>
        </main>
      </div>
    </div>
  );
}
