import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { gql } from "@urql/core";
import { GitBranchPlus, Loader2, Maximize2, Minus, Minimize2, Plus, Upload } from "lucide-react";
import type { Artifact } from "@trace/gql";
import {
  eventScopeKey,
  useEntitiesByIds,
  useEntityField,
  useEntityIds,
  useEntityStore,
  useScopedEvents,
} from "@trace/client-core";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { DesignCommentPopover, type DesignCommentInput } from "./DesignCommentPopover";
import { DesignHarnessSettingsPopover } from "./DesignHarnessSettingsPopover";
import { DesignPdfExportPopover, type DesignPdfPageOptions } from "./DesignPdfExportPopover";
import { DesignPromptPopover, type DesignPromptInput } from "./DesignPromptPopover";
import { DesignTweaksPopover } from "./DesignTweaksPopover";
import { navigateToSession } from "../../stores/ui";
import { DesignArtifactCard } from "./DesignArtifactCard";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  buildDesignArtifactPublicUrlFromOrigin,
  buildDesignIterationPromptDefault,
  clampZoom,
  anchorLabel,
  commentsByArtifact,
  getArtifactLineageStrip,
  getArtifactPlacements,
  getCanvasBounds,
  promotedSessionTarget,
  streamingArtifactsFromEvents,
  updateDesignArtifactSelection,
  type CanvasArtifact,
  type DesignAnchor,
} from "./designCanvasModel";

const DESIGN_ARTIFACTS_QUERY = gql`
  query DesignArtifacts($sessionGroupId: ID!) {
    designArtifacts(sessionGroupId: $sessionGroupId) {
      id
      sessionGroupId
      parentArtifactId
      prompt
      title
      contentType
      html
      metadata
      publishedAt
      publicUrl
      createdAt
      updatedAt
      createdBy {
        id
        name
        avatarUrl
      }
    }
  }
`;

const ITERATE_DESIGN_ARTIFACT_MUTATION = gql`
  mutation IterateDesignArtifact(
    $artifactId: ID!
    $prompt: String!
    $comparisonArtifactIds: [ID!]
  ) {
    iterateDesignArtifact(
      artifactId: $artifactId
      prompt: $prompt
      comparisonArtifactIds: $comparisonArtifactIds
    ) {
      id
    }
  }
`;

const GENERATE_DESIGN_ARTIFACTS_MUTATION = gql`
  mutation GenerateDesignArtifacts($sessionGroupId: ID!, $prompt: String!, $directionCount: Int) {
    generateDesignArtifacts(
      sessionGroupId: $sessionGroupId
      prompt: $prompt
      directionCount: $directionCount
    ) {
      id
    }
  }
`;

const PATCH_DESIGN_ARTIFACT_TOKENS_MUTATION = gql`
  mutation PatchDesignArtifactTokens($artifactId: ID!, $tokens: JSON!) {
    patchDesignArtifactTokens(artifactId: $artifactId, tokens: $tokens) {
      id
    }
  }
`;

const COMMENT_DESIGN_ARTIFACT_MUTATION = gql`
  mutation CommentDesignArtifact(
    $artifactId: ID!
    $body: String!
    $anchor: JSON
    $sendToAgent: Boolean
  ) {
    commentDesignArtifact(
      artifactId: $artifactId
      body: $body
      anchor: $anchor
      sendToAgent: $sendToAgent
    ) {
      id
    }
  }
`;

const PUBLISH_DESIGN_ARTIFACT_MUTATION = gql`
  mutation PublishDesignArtifact($artifactId: ID!) {
    publishDesignArtifact(artifactId: $artifactId) {
      id
      publishedAt
      publicUrl
    }
  }
`;

const EXPORT_DESIGN_ARTIFACT_PDF_MUTATION = gql`
  mutation ExportDesignArtifactPdf($artifactId: ID!, $pageOptions: DesignPdfPageOptionsInput) {
    exportDesignArtifactPdf(artifactId: $artifactId, pageOptions: $pageOptions) {
      id
    }
  }
`;

const PROMOTE_DESIGN_ARTIFACT_MUTATION = gql`
  mutation PromoteDesignArtifactToCodingSession($artifactId: ID!, $referenceArtifactIds: [ID!]) {
    promoteDesignArtifactToCodingSession(
      artifactId: $artifactId
      referenceArtifactIds: $referenceArtifactIds
    ) {
      id
      sessionGroupId
    }
  }
`;

type ArtifactResult = {
  designArtifacts?: Artifact[];
};

const USER_CONTENT_ORIGIN = import.meta.env.VITE_TRACE_USER_CONTENT_ORIGIN?.trim() || null;

type Viewport = {
  x: number;
  y: number;
  scale: number;
};

function getArtifactPublicUrl(artifact: Artifact) {
  return buildDesignArtifactPublicUrlFromOrigin(artifact, USER_CONTENT_ORIGIN);
}

export function DesignCanvas({
  sessionGroupId,
  sessionId,
}: {
  sessionGroupId: string;
  sessionId?: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<string[]>([]);
  const [focusModeArtifactId, setFocusModeArtifactId] = useState<string | null>(null);
  const [selectedAnchors, setSelectedAnchors] = useState<Record<string, DesignAnchor>>({});
  const [viewport, setViewport] = useState<Viewport>({ x: 80, y: 60, scale: 0.8 });
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    viewport: Viewport;
  } | null>(null);

  const designSystemId = useEntityField("sessionGroups", sessionGroupId, "designSystemId") as
    | string
    | null
    | undefined;
  const designSkillIds = useEntityField("sessionGroups", sessionGroupId, "designSkillIds") as
    | string[]
    | null
    | undefined;
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const filterArtifactForGroup = useCallback(
    (artifact: Artifact) => artifact.sessionGroupId === sessionGroupId,
    [sessionGroupId],
  );
  const sortArtifactsByCreation = useCallback(
    (a: Artifact, b: Artifact) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    [],
  );
  const artifactIds = useEntityIds("artifacts", filterArtifactForGroup, sortArtifactsByCreation);
  const artifactEntities = useEntitiesByIds("artifacts", artifactIds);
  const artifacts = useMemo(
    () => artifactEntities.filter((artifact): artifact is Artifact => artifact !== null),
    [artifactEntities],
  );
  const scopedEvents = useScopedEvents(sessionId ? eventScopeKey("session", sessionId) : "");
  const commentsByArtifactId = useMemo(() => commentsByArtifact(scopedEvents), [scopedEvents]);
  const streamingArtifacts = useMemo(
    () => streamingArtifactsFromEvents(scopedEvents, artifacts),
    [artifacts, scopedEvents],
  );
  const visibleArtifacts = useMemo(
    () => [...artifacts, ...Object.values(streamingArtifacts)],
    [artifacts, streamingArtifacts],
  );
  const selectedArtifactId = selectedArtifactIds.at(-1) ?? null;
  const selectedArtifact = useMemo(
    () =>
      visibleArtifacts.find((artifact) => artifact.id === selectedArtifactId) ??
      visibleArtifacts[0] ??
      null,
    [selectedArtifactId, visibleArtifacts],
  );
  const selectedPersistedArtifact = useMemo(
    () =>
      selectedArtifactId
        ? (artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null)
        : null,
    [artifacts, selectedArtifactId],
  );
  const selectedPersistedArtifacts = useMemo(
    () =>
      selectedArtifactIds
        .map((artifactId) => artifacts.find((artifact) => artifact.id === artifactId))
        .filter((artifact): artifact is Artifact => artifact !== undefined),
    [artifacts, selectedArtifactIds],
  );
  const promptDefaultArtifacts = useMemo(
    () =>
      selectedPersistedArtifact
        ? [
            selectedPersistedArtifact,
            ...selectedPersistedArtifacts.filter(
              (artifact) => artifact.id !== selectedPersistedArtifact.id,
            ),
          ]
        : [],
    [selectedPersistedArtifact, selectedPersistedArtifacts],
  );
  const placements = useMemo(() => getArtifactPlacements(visibleArtifacts), [visibleArtifacts]);
  const focusArtifact = useMemo(
    () =>
      visibleArtifacts.find((artifact) => artifact.id === focusModeArtifactId) ??
      selectedArtifact ??
      null,
    [focusModeArtifactId, selectedArtifact, visibleArtifacts],
  );
  const focusLineage = useMemo(
    () => getArtifactLineageStrip(visibleArtifacts, focusArtifact?.id ?? null),
    [focusArtifact?.id, visibleArtifacts],
  );
  const selectedAnchor = selectedPersistedArtifact
    ? (selectedAnchors[selectedPersistedArtifact.id] ?? null)
    : null;

  const hydrateArtifacts = useCallback(async () => {
    setLoading(true);
    const result = await client
      .query<ArtifactResult>(DESIGN_ARTIFACTS_QUERY, { sessionGroupId })
      .toPromise();
    const fetched = result.data?.designArtifacts ?? [];
    if (fetched.length > 0) {
      upsertMany("artifacts", fetched);
    }
    setLoading(false);
  }, [sessionGroupId, upsertMany]);

  useEffect(() => {
    void hydrateArtifacts();
  }, [hydrateArtifacts]);

  const fitCanvas = useCallback(() => {
    const element = canvasRef.current;
    if (!element) return;

    const bounds = getCanvasBounds(placements);
    const width = element.clientWidth;
    const height = element.clientHeight;
    const scale = clampZoom(Math.min((width - 120) / bounds.width, (height - 120) / bounds.height));
    setViewport({
      scale,
      x: (width - bounds.width * scale) / 2 - bounds.x * scale,
      y: (height - bounds.height * scale) / 2 - bounds.y * scale,
    });
  }, [placements]);

  useEffect(() => {
    if (placements.length > 0) {
      fitCanvas();
    }
  }, [fitCanvas, placements.length]);

  const zoomBy = useCallback((delta: number) => {
    const element = canvasRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    setViewport((current) => {
      const nextScale = clampZoom(current.scale * delta);
      const worldX = (centerX - current.x) / current.scale;
      const worldY = (centerY - current.y) / current.scale;
      return {
        scale: nextScale,
        x: centerX - worldX * nextScale,
        y: centerY - worldY * nextScale,
      };
    });
  }, []);

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    const element = canvasRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

    setViewport((current) => {
      if (event.ctrlKey || event.metaKey) {
        const nextScale = clampZoom(current.scale * Math.exp(-event.deltaY * 0.006));
        const worldX = (pointerX - current.x) / current.scale;
        const worldY = (pointerY - current.y) / current.scale;
        return {
          scale: nextScale,
          x: pointerX - worldX * nextScale,
          y: pointerY - worldY * nextScale,
        };
      }

      return {
        ...current,
        x: current.x - event.deltaX,
        y: current.y - event.deltaY,
      };
    });
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        viewport,
      };
    },
    [viewport],
  );

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    setViewport({
      ...drag.viewport,
      x: drag.viewport.x + event.clientX - drag.startX,
      y: drag.viewport.y + event.clientY - drag.startY,
    });
  }, []);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }, []);

  const handleAnchorSelected = useCallback((artifactId: string, anchor: DesignAnchor) => {
    setSelectedArtifactIds([artifactId]);
    setSelectedAnchors((current) => ({ ...current, [artifactId]: anchor }));
    toast.success("Element selected", { description: anchorLabel(anchor) });
  }, []);

  const selectArtifact = useCallback((artifactId: string, additive: boolean) => {
    setSelectedArtifactIds((current) =>
      updateDesignArtifactSelection(current, artifactId, additive),
    );
  }, []);

  const enterFocusMode = useCallback(() => {
    if (!selectedPersistedArtifact) return;
    setFocusModeArtifactId(selectedPersistedArtifact.id);
    setSelectedArtifactIds([selectedPersistedArtifact.id]);
  }, [selectedPersistedArtifact]);

  const exitFocusMode = useCallback(() => {
    setFocusModeArtifactId(null);
  }, []);

  const mutateSelectedArtifact = useCallback(
    async (
      mutation: ReturnType<typeof gql>,
      variables: Record<string, unknown>,
      successMessage: string,
    ) => {
      const result = await client.mutation(mutation, variables).toPromise();
      if (result.error) {
        toast.error("Design action failed", { description: result.error.message });
        return;
      }
      toast.success(successMessage);
    },
    [],
  );

  const handleIterate = useCallback(
    async ({ prompt }: DesignPromptInput) => {
      if (!selectedPersistedArtifact) return;
      const comparisonArtifactIds = promptDefaultArtifacts
        .slice(1)
        .map((artifact) => artifact.id)
        .filter((artifactId) => artifactId !== selectedPersistedArtifact.id);
      await mutateSelectedArtifact(
        ITERATE_DESIGN_ARTIFACT_MUTATION,
        {
          artifactId: selectedPersistedArtifact.id,
          prompt,
          comparisonArtifactIds: comparisonArtifactIds.length > 0 ? comparisonArtifactIds : null,
        },
        "Variant created",
      );
    },
    [mutateSelectedArtifact, promptDefaultArtifacts, selectedPersistedArtifact],
  );

  const handleGenerateDirections = useCallback(
    async ({ prompt }: DesignPromptInput) => {
      await mutateSelectedArtifact(
        GENERATE_DESIGN_ARTIFACTS_MUTATION,
        { sessionGroupId, prompt, directionCount: 3 },
        "Directions generated",
      );
    },
    [mutateSelectedArtifact, sessionGroupId],
  );

  const handleTweak = useCallback(
    async (tokens: Record<string, string>) => {
      if (!selectedPersistedArtifact) return;
      await mutateSelectedArtifact(
        PATCH_DESIGN_ARTIFACT_TOKENS_MUTATION,
        { artifactId: selectedPersistedArtifact.id, tokens },
        "Tweak applied",
      );
    },
    [mutateSelectedArtifact, selectedPersistedArtifact],
  );

  const handlePublish = useCallback(() => {
    if (!selectedPersistedArtifact) return;
    void (async () => {
      const result = await client
        .mutation<{ publishDesignArtifact?: Artifact }>(PUBLISH_DESIGN_ARTIFACT_MUTATION, {
          artifactId: selectedPersistedArtifact.id,
        })
        .toPromise();
      if (result.error) {
        toast.error("Design action failed", { description: result.error.message });
        return;
      }

      const publishedArtifact = result.data?.publishDesignArtifact ?? selectedPersistedArtifact;
      const publicUrl = getArtifactPublicUrl(publishedArtifact);
      if (publicUrl) {
        void navigator.clipboard?.writeText(publicUrl).catch(() => undefined);
        toast.success("Artifact published", {
          action: {
            label: "Open",
            onClick: () => window.open(publicUrl, "_blank", "noopener,noreferrer"),
          },
        });
        return;
      }
      toast.success("Artifact published");
    })();
  }, [selectedPersistedArtifact]);

  const handleComment = useCallback(
    async (comment: DesignCommentInput) => {
      if (!selectedPersistedArtifact) return;
      await mutateSelectedArtifact(
        COMMENT_DESIGN_ARTIFACT_MUTATION,
        {
          artifactId: selectedPersistedArtifact.id,
          body: comment.body,
          anchor: selectedAnchor,
          sendToAgent: comment.sendToAgent,
        },
        "Comment added",
      );
    },
    [mutateSelectedArtifact, selectedAnchor, selectedPersistedArtifact],
  );

  const handleExportPdf = useCallback(
    async (pageOptions: DesignPdfPageOptions | null) => {
      if (!selectedPersistedArtifact) return;
      await mutateSelectedArtifact(
        EXPORT_DESIGN_ARTIFACT_PDF_MUTATION,
        { artifactId: selectedPersistedArtifact.id, pageOptions },
        "PDF export queued",
      );
    },
    [mutateSelectedArtifact, selectedPersistedArtifact],
  );

  const handlePromote = useCallback(() => {
    if (!selectedPersistedArtifact) return;
    void (async () => {
      const referenceArtifactIds = promptDefaultArtifacts
        .slice(1)
        .map((artifact) => artifact.id)
        .filter((artifactId) => artifactId !== selectedPersistedArtifact.id);
      const result = await client
        .mutation<{
          promoteDesignArtifactToCodingSession?: { id: string; sessionGroupId: string };
        }>(PROMOTE_DESIGN_ARTIFACT_MUTATION, {
          artifactId: selectedPersistedArtifact.id,
          referenceArtifactIds: referenceArtifactIds.length > 0 ? referenceArtifactIds : null,
        })
        .toPromise();
      if (result.error) {
        toast.error("Design action failed", { description: result.error.message });
        return;
      }

      const target = promotedSessionTarget(result.data?.promoteDesignArtifactToCodingSession);
      if (!target) {
        toast.error("Promotion failed", {
          description: "Server did not return a promoted session.",
        });
        return;
      }

      toast.success("Coding session created");
      navigateToSession(null, target.sessionGroupId, target.sessionId);
    })();
  }, [promptDefaultArtifacts, selectedPersistedArtifact]);

  return (
    <main
      ref={canvasRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative h-full min-h-0 touch-none overflow-hidden bg-surface-deep"
    >
      <div
        className="absolute right-3 top-3 z-10 flex items-center overflow-hidden rounded-md border bg-background shadow-sm"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DesignHarnessSettingsPopover
          sessionGroupId={sessionGroupId}
          designSystemId={designSystemId}
          designSkillIds={designSkillIds}
          triggerClassName="border-r"
        />
        <DesignPromptPopover
          title="Generate directions"
          actionLabel="Generate"
          onSubmit={handleGenerateDirections}
        />
        <div className="inline-flex h-8 items-center border-r px-2 text-xs tabular-nums text-muted-foreground">
          {selectedArtifactIds.length === 0 ? "None" : `${selectedArtifactIds.length} selected`}
        </div>
        <DesignPromptPopover
          disabled={!selectedPersistedArtifact}
          title={
            selectedPersistedArtifacts.length >= 2 ? "Create comparative variant" : "Create variant"
          }
          actionLabel="Create"
          defaultPrompt={buildDesignIterationPromptDefault(promptDefaultArtifacts)}
          onSubmit={handleIterate}
        />
        <DesignTweaksPopover disabled={!selectedPersistedArtifact} onApply={handleTweak} />
        <DesignCommentPopover
          disabled={!selectedPersistedArtifact}
          hasAnchor={selectedAnchor !== null}
          onSubmit={handleComment}
        />
        <button
          type="button"
          onClick={handlePublish}
          disabled={!selectedPersistedArtifact}
          className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40"
          aria-label="Publish"
          title="Publish"
        >
          <Upload size={14} />
        </button>
        <DesignPdfExportPopover disabled={!selectedPersistedArtifact} onExport={handleExportPdf} />
        <button
          type="button"
          onClick={handlePromote}
          disabled={!selectedPersistedArtifact}
          className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40"
          aria-label="Promote to coding session"
          title="Promote to coding session"
        >
          <GitBranchPlus size={14} />
        </button>
        <button
          type="button"
          onClick={focusModeArtifactId ? exitFocusMode : enterFocusMode}
          disabled={!selectedPersistedArtifact && !focusModeArtifactId}
          className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40"
          aria-label={focusModeArtifactId ? "Exit focus mode" : "Focus artifact"}
          title={focusModeArtifactId ? "Exit focus mode" : "Focus artifact"}
        >
          {focusModeArtifactId ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button
          type="button"
          onClick={() => zoomBy(0.75)}
          className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground"
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus size={14} />
        </button>
        <div className="w-14 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(viewport.scale * 100)}%
        </div>
        <button
          type="button"
          onClick={() => zoomBy(1.25)}
          className="inline-flex h-8 w-8 items-center justify-center border-l border-r text-muted-foreground hover:text-foreground"
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          onClick={fitCanvas}
          className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label="Fit canvas"
          title="Fit canvas"
        >
          <Maximize2 size={14} />
        </button>
      </div>
      {loading ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          <Loader2 size={16} className="mr-2 animate-spin" />
          Loading artifacts
        </div>
      ) : focusModeArtifactId && focusArtifact ? (
        <div
          className="absolute inset-0 min-h-0 p-4 pt-14"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="flex h-full min-h-0 gap-3">
            <aside className="flex w-48 shrink-0 flex-col overflow-hidden border-r pr-3">
              <div className="mb-2 px-1 text-xs font-medium text-muted-foreground">Versions</div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                {focusLineage.map((artifact, index) => (
                  <button
                    key={artifact.id}
                    type="button"
                    onClick={() => {
                      setFocusModeArtifactId(artifact.id);
                      setSelectedArtifactIds([artifact.id]);
                    }}
                    className={cn(
                      "min-h-10 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                      artifact.id === focusArtifact.id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                    title={artifact.title}
                  >
                    <span className="block text-[10px] uppercase text-muted-foreground">
                      v{index + 1}
                    </span>
                    <span className="block truncate">{artifact.title}</span>
                  </button>
                ))}
              </div>
            </aside>
            <div className="min-w-0 flex-1">
              <DesignArtifactCard
                artifact={focusArtifact}
                selected
                selectedAnchor={selectedAnchors[focusArtifact.id] ?? null}
                comments={commentsByArtifactId[focusArtifact.id] ?? []}
                onAnchorSelected={handleAnchorSelected}
              />
            </div>
          </div>
        </div>
      ) : selectedArtifact ? (
        <div
          className="absolute left-0 top-0 origin-top-left will-change-transform"
          style={{
            transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`,
          }}
        >
          {placements.map((placement) => (
            <div
              key={placement.artifact.id}
              className="absolute"
              style={{
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                transform: `translate3d(${placement.x}px, ${placement.y}px, 0)`,
              }}
              onClick={(event) =>
                selectArtifact(
                  placement.artifact.id,
                  event.shiftKey || event.metaKey || event.ctrlKey,
                )
              }
            >
              <DesignArtifactCard
                artifact={placement.artifact}
                selected={selectedArtifactIds.includes(placement.artifact.id)}
                selectedAnchor={selectedAnchors[placement.artifact.id] ?? null}
                comments={commentsByArtifactId[placement.artifact.id] ?? []}
                onAnchorSelected={handleAnchorSelected}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No artifacts yet.
        </div>
      )}
    </main>
  );
}
