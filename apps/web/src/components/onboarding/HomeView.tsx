import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionGroupKind } from "@trace/gql";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import { normalizeTool } from "../session/picker/pickerShared";
import { createHomeSession } from "../../lib/create-home-session";
import { detectHomeSessionKind, detectPromptRepo } from "../home/home-kind-routing";
import { useHomeComposerStore } from "../../stores/home-composer";
import { useHomeDataStore } from "../../stores/home-data";
import { HomeComposer } from "../home/HomeComposer";
import { HomeFirstRunSparks } from "../home/HomeFirstRunSparks";
import { HomeHeader } from "../home/HomeHeader";
import { DEFAULT_HOME_KIND } from "../home/HomeKindIcon";
import { HomeKindSelector } from "../home/HomeKindSelector";
import { HomeLedgerSkeleton } from "../home/HomeLedgerSkeleton";
import { HomeWorkLedger } from "../home/HomeWorkLedger";
import { useHomeWorkData } from "../home/useHomeWorkData";
import { MODE_CYCLE, type InteractionMode } from "../session/interactionModes";
import { getDefaultModel, getDefaultReasoningEffort } from "../session/modelOptions";
import type { ToolOptionValue } from "../session/picker/pickerShared";
import {
  clearHomeDraft,
  isSubstantialPromptEdit,
  readHomeDraft,
  saveHomeDraft,
} from "../home/home-draft";

export function HomeView({ mode = "home" }: { mode?: "home" | "create" }) {
  const activeOrgId = useAuthStore((state: AuthState) => state.activeOrgId);
  const defaultTool = useAuthStore((state: AuthState) => state.user?.defaultSessionTool);
  const reposTable = useEntityStore((state) => state.repos);
  const channelsTable = useEntityStore((state) => state.channels);
  const repos = useMemo(
    () => Object.values(reposTable).sort((a, b) => a.name.localeCompare(b.name)),
    [reposTable],
  );
  const channels = useMemo(() => Object.values(channelsTable), [channelsTable]);
  const work = useHomeWorkData();
  const [draftOrgId, setDraftOrgId] = useState(activeOrgId);
  const [prompt, setPrompt] = useState(() => readHomeDraft(activeOrgId));
  const [manualKind, setManualKind] = useState<SessionGroupKind | null>(null);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolOptionValue>(() =>
    normalizeTool(defaultTool ?? "claude_code"),
  );
  const [model, setModel] = useState<string | null>(() => getDefaultModel(tool) ?? null);
  const [reasoningEffort, setReasoningEffort] = useState<string | null>(
    () => getDefaultReasoningEffort(tool) ?? null,
  );
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("code");
  const [submitting, setSubmitting] = useState(false);
  const manualPromptRef = useRef("");
  const homeDataReady = useHomeDataStore(
    (state) => state.organizationId === activeOrgId && state.codingLoaded && state.generatedLoaded,
  );
  const detectedKind = detectHomeSessionKind(prompt) ?? DEFAULT_HOME_KIND;
  const activeKind = manualKind ?? detectedKind;
  const detectedRepo = useMemo(() => detectPromptRepo(prompt, repos), [prompt, repos]);
  const effectiveRepoId =
    activeKind === "coding" ? (selectedRepoId ?? detectedRepo?.id ?? null) : null;
  const effectiveRepo = repos.find((repo) => repo.id === effectiveRepoId) ?? null;
  const isCreateMode = mode === "create";

  useEffect(() => {
    if (!isCreateMode) return;
    const frame = requestAnimationFrame(() => useHomeComposerStore.getState().requestFocus());
    return () => cancelAnimationFrame(frame);
  }, [isCreateMode]);

  useEffect(() => {
    if (draftOrgId === activeOrgId) return;
    setDraftOrgId(activeOrgId);
    setPrompt(readHomeDraft(activeOrgId));
    setManualKind(null);
    setSelectedRepoId(null);
  }, [activeOrgId, draftOrgId]);

  useEffect(() => {
    if (draftOrgId !== activeOrgId) return;
    saveHomeDraft(activeOrgId, prompt);
  }, [activeOrgId, draftOrgId, prompt]);

  const updatePrompt = (nextPrompt: string) => {
    setPrompt(nextPrompt);
    if (manualKind && isSubstantialPromptEdit(manualPromptRef.current, nextPrompt)) {
      setManualKind(null);
    }
  };

  const selectKind = (kind: SessionGroupKind) => {
    setManualKind(kind);
    manualPromptRef.current = prompt;
    if (kind !== "coding") setSelectedRepoId(null);
  };

  const selectTool = (nextTool: ToolOptionValue) => {
    setTool(nextTool);
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
    const created = await createHomeSession({
      prompt: submittedPrompt,
      kind: activeKind,
      tool,
      model,
      reasoningEffort,
      interactionMode: submittedInteractionMode,
      repo: effectiveRepo,
      channels,
    });
    if (created) {
      setPrompt("");
      setManualKind(null);
      setSelectedRepoId(null);
      clearHomeDraft(activeOrgId);
    }
    setSubmitting(false);
    return created;
  };

  const firstRun = homeDataReady && work.totalOwnedOrParticipating === 0;
  const showIntro = isCreateMode || firstRun;
  const people = work.items.flatMap((item) => (item.owner ? [item.owner] : []));

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--th-surface-mid)]">
      <HomeHeader people={people} title={isCreateMode ? "Create" : "Home"} />
      <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="pointer-events-none absolute left-1/2 top-[-70px] h-[420px] w-[min(900px,100vw)] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--th-accent)_8%,transparent),transparent_70%)]" />
        <main
          className={`relative mx-auto flex min-h-full w-full flex-col px-4 pb-7 sm:px-6 ${
            showIntro ? "pt-16 sm:pt-24" : "pt-8 sm:pt-11"
          }`}
        >
          <h1 className="text-center text-[22px] font-semibold tracking-[-0.01em] text-[var(--th-heading)] sm:text-2xl">
            What are you making?
          </h1>
          {showIntro && (
            <p className="mt-1.5 text-center text-[13px] text-[var(--th-muted)]">
              Describe it — Trace routes it to the right kind of session.
            </p>
          )}
          <div className="mt-[18px]">
            <HomeComposer
              prompt={prompt}
              kind={activeKind}
              repos={repos}
              repoId={effectiveRepoId}
              tool={tool}
              model={model}
              reasoningEffort={reasoningEffort}
              mode={interactionMode}
              submitting={submitting}
              onPromptChange={updatePrompt}
              onRepoChange={setSelectedRepoId}
              onToolChange={selectTool}
              onModelChange={setModel}
              onReasoningEffortChange={setReasoningEffort}
              onModeChange={cycleMode}
              onSubmit={submit}
            />
            <HomeKindSelector
              activeKind={activeKind}
              hasPrompt={prompt.trim().length > 0}
              manuallySelected={manualKind !== null}
              onSelect={selectKind}
            />
          </div>

          {isCreateMode ? (
            <HomeFirstRunSparks
              showCollectionHint={false}
              onUsePrompt={(starter) => useHomeComposerStore.getState().requestFocus(starter)}
            />
          ) : !homeDataReady ? (
            <HomeLedgerSkeleton />
          ) : firstRun ? (
            <HomeFirstRunSparks
              onUsePrompt={(starter) => useHomeComposerStore.getState().requestFocus(starter)}
            />
          ) : (
            <HomeWorkLedger items={work.items} />
          )}

          <p className="mt-auto pt-8 text-center text-[11px] text-[var(--th-faint)]">
            <span className="hidden sm:inline">⌘N New session · </span>⌘K Search · ⌘J Latest session
          </p>
        </main>
      </div>
    </div>
  );
}
