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
import { Loader2, Maximize2, Minus, Plus, RefreshCw } from "lucide-react";
import type { Artifact } from "@trace/gql";
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

const CREATE_DESIGN_ARTIFACT_MUTATION = gql`
  mutation CreateDesignArtifact($sessionGroupId: ID!, $prompt: String!) {
    createDesignArtifact(sessionGroupId: $sessionGroupId, prompt: $prompt) {
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

type ArtifactResult = {
  designArtifacts?: Artifact[];
};

type CreateArtifactResult = {
  createDesignArtifact?: Artifact;
};

const CARD_WIDTH = 720;
const CARD_HEIGHT = 520;
const CARD_GAP = 80;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

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

function ArtifactCard({ artifact, selected }: { artifact: Artifact; selected: boolean }) {
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
      <iframe
        title={artifact.title}
        srcDoc={artifact.html}
        sandbox="allow-scripts"
        className="pointer-events-none min-h-0 flex-1 bg-white"
      />
    </article>
  );
}

export function DesignCanvas({ sessionGroupId }: { sessionGroupId: string }) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [prompt, setPrompt] = useState("");
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

  const createArtifact = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    const result = await client
      .mutation<CreateArtifactResult>(CREATE_DESIGN_ARTIFACT_MUTATION, {
        sessionGroupId,
        prompt: trimmed,
      })
      .toPromise();
    const artifact = result.data?.createDesignArtifact;
    if (artifact) {
      setArtifacts((current) => [...current, artifact]);
      setSelectedArtifactId(artifact.id);
      setPrompt("");
    }
    setCreating(false);
  }, [creating, prompt, sessionGroupId]);

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

  return (
    <div className="flex h-full min-h-0 bg-surface-deep">
      <aside className="flex w-[320px] shrink-0 flex-col border-r bg-background">
        <div className="border-b p-3">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe another direction"
            className="min-h-24 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={createArtifact}
              disabled={!prompt.trim() || creating}
              className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Option
            </button>
            <button
              type="button"
              onClick={loadArtifacts}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground"
              aria-label="Refresh artifacts"
              title="Refresh artifacts"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {artifacts.map((artifact) => (
            <button
              key={artifact.id}
              type="button"
              onClick={() => setSelectedArtifactId(artifact.id)}
              className={cn(
                "mb-2 block w-full rounded-md border px-3 py-2 text-left text-sm",
                selectedArtifact?.id === artifact.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-surface-elevated",
              )}
            >
              <div className="truncate font-medium">{artifact.title}</div>
              <div className="truncate text-xs text-muted-foreground">{artifact.prompt}</div>
            </button>
          ))}
        </div>
      </aside>
      <main
        ref={canvasRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative min-h-0 flex-1 touch-none overflow-hidden bg-surface-deep"
      >
        <div
          className="absolute right-3 top-3 z-10 flex items-center overflow-hidden rounded-md border bg-background shadow-sm"
          onPointerDown={(event) => event.stopPropagation()}
        >
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
    </div>
  );
}
