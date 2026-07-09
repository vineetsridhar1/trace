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
import {
  FileDown,
  GitBranchPlus,
  Loader2,
  Maximize2,
  MessageSquare,
  Minus,
  Plus,
  SlidersHorizontal,
  Upload,
  Wand2,
} from "lucide-react";
import type { Artifact } from "@trace/gql";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";

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
  mutation IterateDesignArtifact($artifactId: ID!, $prompt: String!) {
    iterateDesignArtifact(artifactId: $artifactId, prompt: $prompt) {
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
  mutation CommentDesignArtifact($artifactId: ID!, $body: String!, $sendToAgent: Boolean) {
    commentDesignArtifact(artifactId: $artifactId, body: $body, sendToAgent: $sendToAgent) {
      id
    }
  }
`;

const PUBLISH_DESIGN_ARTIFACT_MUTATION = gql`
  mutation PublishDesignArtifact($artifactId: ID!) {
    publishDesignArtifact(artifactId: $artifactId) {
      id
      publishedAt
    }
  }
`;

const EXPORT_DESIGN_ARTIFACT_PDF_MUTATION = gql`
  mutation ExportDesignArtifactPdf($artifactId: ID!) {
    exportDesignArtifactPdf(artifactId: $artifactId) {
      id
    }
  }
`;

const PROMOTE_DESIGN_ARTIFACT_MUTATION = gql`
  mutation PromoteDesignArtifactToCodingSession($artifactId: ID!) {
    promoteDesignArtifactToCodingSession(artifactId: $artifactId) {
      id
      sessionGroupId
    }
  }
`;

type ArtifactResult = {
  designArtifacts?: Artifact[];
};

const CARD_WIDTH = 720;
const CARD_HEIGHT = 520;
const CARD_GAP = 80;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const USER_CONTENT_ORIGIN = import.meta.env.VITE_TRACE_USER_CONTENT_ORIGIN?.trim() || null;

type Viewport = {
  x: number;
  y: number;
  scale: number;
};

type ArtifactPlacement = {
  artifact: Artifact;
  x: number;
  y: number;
};

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function getArtifactPlacements(artifacts: Artifact[]): ArtifactPlacement[] {
  return artifacts.map((artifact, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    return {
      artifact,
      x: column * (CARD_WIDTH + CARD_GAP),
      y: row * (CARD_HEIGHT + CARD_GAP),
    };
  });
}

function getCanvasBounds(placements: ArtifactPlacement[]) {
  if (placements.length === 0) {
    return { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT };
  }

  let minX = placements[0]?.x ?? 0;
  let minY = placements[0]?.y ?? 0;
  let maxX = minX + CARD_WIDTH;
  let maxY = minY + CARD_HEIGHT;

  for (const placement of placements) {
    minX = Math.min(minX, placement.x);
    minY = Math.min(minY, placement.y);
    maxX = Math.max(maxX, placement.x + CARD_WIDTH);
    maxY = Math.max(maxY, placement.y + CARD_HEIGHT);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getArtifactBootstrapUrl(artifactId: string) {
  if (!USER_CONTENT_ORIGIN) return null;
  try {
    const url = new URL(USER_CONTENT_ORIGIN);
    url.hostname = `${artifactId}.${url.hostname}`;
    url.pathname = "/_bootstrap";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function ArtifactCard({ artifact, selected }: { artifact: Artifact; selected: boolean }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const bootstrapUrl = useMemo(() => getArtifactBootstrapUrl(artifact.id), [artifact.id]);
  const bootstrapOrigin = useMemo(
    () => (bootstrapUrl ? new URL(bootstrapUrl).origin : null),
    [bootstrapUrl],
  );
  const postArtifactHtml = useCallback(() => {
    const target = iframeRef.current?.contentWindow;
    if (!target || !bootstrapOrigin) return;
    target.postMessage(
      {
        type: "trace:artifact_html",
        html: artifact.html,
      },
      bootstrapOrigin,
    );
  }, [artifact.html, bootstrapOrigin]);

  useEffect(() => {
    if (bootstrapUrl) postArtifactHtml();
  }, [bootstrapUrl, postArtifactHtml]);

  return (
    <article
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-background shadow-sm",
        selected ? "border-primary" : "border-border",
      )}
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b px-3">
        <div className="min-w-0 truncate text-sm font-medium">{artifact.title}</div>
        <div className="shrink-0 text-xs text-muted-foreground">
          {new Date(artifact.createdAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
      </div>
      {bootstrapUrl ? (
        <iframe
          ref={iframeRef}
          title={artifact.title}
          src={bootstrapUrl}
          sandbox="allow-scripts allow-same-origin"
          className="pointer-events-none min-h-0 flex-1 bg-white"
          onLoad={postArtifactHtml}
        />
      ) : (
        <iframe
          title={artifact.title}
          srcDoc={artifact.html}
          sandbox="allow-scripts"
          className="pointer-events-none min-h-0 flex-1 bg-white"
        />
      )}
    </article>
  );
}

export function DesignCanvas({ sessionGroupId }: { sessionGroupId: string }) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 80, y: 60, scale: 0.8 });
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    viewport: Viewport;
  } | null>(null);

  const selectedArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? artifacts[0] ?? null,
    [artifacts, selectedArtifactId],
  );
  const placements = useMemo(() => getArtifactPlacements(artifacts), [artifacts]);

  const loadArtifacts = useCallback(async () => {
    setLoading(true);
    const result = await client
      .query<ArtifactResult>(DESIGN_ARTIFACTS_QUERY, { sessionGroupId })
      .toPromise();
    setArtifacts(result.data?.designArtifacts ?? []);
    setLoading(false);
  }, [sessionGroupId]);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

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
      await loadArtifacts();
    },
    [loadArtifacts],
  );

  const handleIterate = useCallback(() => {
    if (!selectedArtifact) return;
    const prompt = window.prompt("Describe the next variant", selectedArtifact.prompt ?? "");
    if (!prompt?.trim()) return;
    void mutateSelectedArtifact(
      ITERATE_DESIGN_ARTIFACT_MUTATION,
      { artifactId: selectedArtifact.id, prompt: prompt.trim() },
      "Variant created",
    );
  }, [mutateSelectedArtifact, selectedArtifact]);

  const handleTweak = useCallback(() => {
    if (!selectedArtifact) return;
    const name = window.prompt("CSS variable name", "--trace-accent");
    if (!name?.trim()) return;
    const value = window.prompt("CSS variable value", "#0f766e");
    if (!value?.trim()) return;
    void mutateSelectedArtifact(
      PATCH_DESIGN_ARTIFACT_TOKENS_MUTATION,
      { artifactId: selectedArtifact.id, tokens: { [name.trim()]: value.trim() } },
      "Tweak applied",
    );
  }, [mutateSelectedArtifact, selectedArtifact]);

  const handlePublish = useCallback(() => {
    if (!selectedArtifact) return;
    void mutateSelectedArtifact(
      PUBLISH_DESIGN_ARTIFACT_MUTATION,
      { artifactId: selectedArtifact.id },
      "Artifact published",
    );
  }, [mutateSelectedArtifact, selectedArtifact]);

  const handleComment = useCallback(() => {
    if (!selectedArtifact) return;
    const body = window.prompt("Add a comment");
    if (!body?.trim()) return;
    const sendToAgent = window.confirm("Send this comment to the agent for the next iteration?");
    void mutateSelectedArtifact(
      COMMENT_DESIGN_ARTIFACT_MUTATION,
      { artifactId: selectedArtifact.id, body: body.trim(), sendToAgent },
      "Comment added",
    );
  }, [mutateSelectedArtifact, selectedArtifact]);

  const handleExportPdf = useCallback(() => {
    if (!selectedArtifact) return;
    void mutateSelectedArtifact(
      EXPORT_DESIGN_ARTIFACT_PDF_MUTATION,
      { artifactId: selectedArtifact.id },
      "PDF export queued",
    );
  }, [mutateSelectedArtifact, selectedArtifact]);

  const handlePromote = useCallback(() => {
    if (!selectedArtifact) return;
    void mutateSelectedArtifact(
      PROMOTE_DESIGN_ARTIFACT_MUTATION,
      { artifactId: selectedArtifact.id },
      "Coding session created",
    );
  }, [mutateSelectedArtifact, selectedArtifact]);

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
        <button
          type="button"
          onClick={handleIterate}
          disabled={!selectedArtifact}
          className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40"
          aria-label="Create variant"
          title="Create variant"
        >
          <Wand2 size={14} />
        </button>
        <button
          type="button"
          onClick={handleTweak}
          disabled={!selectedArtifact}
          className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40"
          aria-label="Tweak tokens"
          title="Tweak tokens"
        >
          <SlidersHorizontal size={14} />
        </button>
        <button
          type="button"
          onClick={handleComment}
          disabled={!selectedArtifact}
          className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40"
          aria-label="Comment"
          title="Comment"
        >
          <MessageSquare size={14} />
        </button>
        <button
          type="button"
          onClick={handlePublish}
          disabled={!selectedArtifact}
          className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40"
          aria-label="Publish"
          title="Publish"
        >
          <Upload size={14} />
        </button>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={!selectedArtifact}
          className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40"
          aria-label="Export PDF"
          title="Export PDF"
        >
          <FileDown size={14} />
        </button>
        <button
          type="button"
          onClick={handlePromote}
          disabled={!selectedArtifact}
          className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40"
          aria-label="Promote to coding session"
          title="Promote to coding session"
        >
          <GitBranchPlus size={14} />
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
              onClick={() => setSelectedArtifactId(placement.artifact.id)}
            >
              <ArtifactCard
                artifact={placement.artifact}
                selected={selectedArtifact.id === placement.artifact.id}
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
