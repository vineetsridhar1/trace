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
  ArrowUpRight,
  Code2,
  Crosshair,
  Loader2,
  Maximize2,
  MessageSquare,
  Minus,
  Monitor,
  Paperclip,
  Plus,
  Send,
  Settings,
  Smartphone,
  Sparkles,
  Tablet,
} from "lucide-react";
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
        "h-full overflow-hidden rounded-lg border bg-white shadow-[0_32px_120px_rgba(0,0,0,0.55)]",
        selected ? "border-[#9b7cff]" : "border-white/20",
      )}
    >
      <iframe
        title={artifact.title}
        srcDoc={artifact.html}
        sandbox="allow-scripts"
        className="pointer-events-none h-full w-full bg-white"
      />
    </article>
  );
}

function ChatArtifactRow({
  artifact,
  selected,
  onSelect,
}: {
  artifact: Artifact;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
        selected
          ? "border-[#7d66d9] bg-[#171421]"
          : "border-[#2c2c34] bg-[#141419] hover:border-[#4a435f]",
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#232235]">
        <span className="text-sm">▣</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[#f4f4f7]">{artifact.title}</div>
        <div className="truncate text-xs text-[#8f8f9b]">
          {new Date(artifact.updatedAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}{" "}
          · preview
        </div>
      </div>
      <ArrowUpRight size={15} className="shrink-0 text-[#7bb0ff]" />
    </button>
  );
}

export function DesignCanvas({
  sessionGroupId,
  groupName,
}: {
  sessionGroupId: string;
  groupName?: string | null;
}) {
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
  const activeVersion = artifacts.length > 0 ? artifacts.length : 1;
  const title = groupName?.trim() || selectedArtifact?.title || "Untitled design";

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
    const scale = clampZoom(Math.min((width - 160) / bounds.width, (height - 180) / bounds.height));
    setViewport({
      scale,
      x: (width - bounds.width * scale) / 2 - bounds.x * scale,
      y: (height - bounds.height * scale) / 2 - bounds.y * scale + 24,
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#07070a] text-[#e8e8ef]">
      <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-[#222229] bg-[#101014] px-5">
        <div className="flex min-w-0 items-center gap-5">
          <div className="flex shrink-0 items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-full bg-[#ff6159]" />
            <span className="h-3.5 w-3.5 rounded-full bg-[#ffbd2e]" />
            <span className="h-3.5 w-3.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-[#bda7ff]">
            <span className="h-2.5 w-2.5 rounded-full bg-[#a78bfa]" />
            In Review
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold leading-5 text-white">{title}</div>
            <div className="truncate text-xs text-[#8b8b96]">Design session · v{activeVersion}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="rounded-md border border-[#2a2a33] bg-[#111116] px-3 py-2 text-sm font-medium text-[#b9b9c4]">
            $1.12 · 2.1M tok
          </div>
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-[#1e7e57] bg-[#102017] px-4 text-sm font-semibold text-[#37e38d]">
            <ArrowUpRight size={15} />
            Publish
          </button>
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-[#32313a] bg-[#111116] px-4 text-sm font-semibold text-[#f4d36d]">
            <Sparkles size={14} />
            Spotlight
          </button>
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-[#32313a] bg-[#111116] px-4 text-sm font-medium text-[#b9b9c4]">
            <Code2 size={15} />
            To code session
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-[34%] min-w-[360px] max-w-[520px] shrink-0 flex-col border-r border-[#222229] bg-[#0d0d11]">
          <div className="min-h-0 flex-1 overflow-y-auto px-7 py-7">
            <div className="rounded-lg border border-[#315886] bg-[#111c2d] px-5 py-4 shadow-[0_18px_48px_rgba(0,0,0,0.25)]">
              <div className="mb-2 flex items-center gap-3 text-sm">
                <span className="font-semibold text-[#72aaff]">You</span>
                <span className="text-[#6f7582]">06:41 PM</span>
              </div>
              <p className="text-[15px] font-medium leading-7 text-[#eef3ff]">
                The queue feels hard to scan — try making the amount and state more prominent, and
                collapse the requester column.
              </p>
            </div>

            <button className="mt-5 text-sm text-[#898995]">› Show thinking</button>

            <div className="mt-7 space-y-4 text-[15px] leading-7 text-[#d7d7df]">
              <p>
                Done — <strong className="text-white">v{activeVersion}</strong> promotes amount to
                a bold leading column, moves state into a pill next to status, and folds requester
                into a hover detail.
              </p>
              <ol className="space-y-3 pl-0">
                <li className="flex gap-3">
                  <span className="font-semibold text-[#b899ff]">1.</span>
                  <span>Row density is compact and easier to scan.</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-semibold text-[#b899ff]">2.</span>
                  <span>Filters and key state are now visually sticky.</span>
                </li>
              </ol>
            </div>

            <div className="mt-7 space-y-3">
              {artifacts.map((artifact) => (
                <ChatArtifactRow
                  key={artifact.id}
                  artifact={artifact}
                  selected={selectedArtifact?.id === artifact.id}
                  onSelect={() => setSelectedArtifactId(artifact.id)}
                />
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between text-sm text-[#8d8d98]">
              <div className="flex items-center gap-3">
                <span className="text-[#2ff38b]">✓</span>
                <span>Run ended</span>
              </div>
              <span>06:43 PM</span>
            </div>
          </div>

          <div className="shrink-0 border-t border-[#222229] bg-[#0d0d11] px-5 py-4">
            {selectedArtifact ? (
              <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-md border border-[#7256bd] bg-[#1a1427] px-3 py-1.5 text-sm text-[#d8c8ff]">
                <Crosshair size={13} />
                <span className="truncate">{selectedArtifact.title}</span>
              </div>
            ) : null}
            <div className="flex items-end gap-2 rounded-lg border border-[#2b2b33] bg-[#15151b] p-3">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe a change, or click an element..."
                className="min-h-12 flex-1 resize-none bg-transparent text-sm leading-6 text-[#f0f0f4] outline-none placeholder:text-[#777780]"
              />
              <button
                type="button"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#a8a8b2] hover:text-white"
                aria-label="Attach"
                title="Attach"
              >
                <Paperclip size={18} />
              </button>
              <button
                type="button"
                onClick={createArtifact}
                disabled={!prompt.trim() || creating}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#2f65c8] text-white disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send"
                title="Send"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-[#898995]">
              <div className="inline-flex rounded-lg border border-[#2b2b33] bg-[#15151b] p-1">
                <button className="inline-flex h-8 items-center gap-2 rounded-md px-3 text-[#8f8f9b]">
                  <Code2 size={14} />
                  Code
                </button>
                <button className="inline-flex h-8 items-center gap-2 rounded-md bg-[#2b2934] px-3 font-semibold text-white">
                  <Sparkles size={14} />
                  Design
                </button>
              </div>
              <div>Claude Code / Opus 4.8</div>
              <div>Medium</div>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-[#07070a]">
          <div className="flex h-[64px] shrink-0 items-center justify-between border-b border-[#222229] bg-[#09090d] px-8">
            <div className="flex items-center gap-5 text-sm text-[#8f8f9b]">
              {Array.from({ length: Math.max(activeVersion, 1) }).map((_, index) => {
                const version = index + 1;
                return (
                  <button
                    key={version}
                    className={cn(
                      "rounded-md px-3 py-1.5",
                      version === activeVersion
                        ? "border border-[#4a4a55] bg-[#2b2b34] font-semibold text-white"
                        : "text-[#8f8f9b] hover:text-white",
                    )}
                  >
                    v{version}
                  </button>
                );
              })}
              <button className="font-medium text-[#70a7ff]">⇄ Diff v{Math.max(activeVersion - 1, 1)}</button>
            </div>
            <div className="flex items-center gap-3">
              <div className="inline-flex h-9 items-center rounded-lg border border-[#2b2b33] bg-[#121218] p-1 text-[#8f8f9b]">
                <button className="inline-flex h-7 w-9 items-center justify-center rounded-md bg-[#2b2b34] text-white">
                  <Monitor size={17} />
                </button>
                <button className="inline-flex h-7 w-9 items-center justify-center">
                  <Smartphone size={14} />
                </button>
                <button className="inline-flex h-7 w-9 items-center justify-center">
                  <Tablet size={15} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => zoomBy(0.75)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#2b2b33] bg-[#121218] text-[#a7a7b1]"
                aria-label="Zoom out"
                title="Zoom out"
              >
                <Minus size={14} />
              </button>
              <div className="w-16 rounded-lg border border-[#2b2b33] bg-[#121218] py-2 text-center text-sm tabular-nums text-[#c6c6d0]">
                {Math.round(viewport.scale * 100)}%
              </div>
              <button
                type="button"
                onClick={() => zoomBy(1.25)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#2b2b33] bg-[#121218] text-[#a7a7b1]"
                aria-label="Zoom in"
                title="Zoom in"
              >
                <Plus size={14} />
              </button>
              <button
                type="button"
                onClick={fitCanvas}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#2b2b33] bg-[#121218] text-[#a7a7b1]"
                aria-label="Fit canvas"
                title="Fit canvas"
              >
                <Maximize2 size={14} />
              </button>
              <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#5d47a5] bg-[#21172f] px-4 text-sm font-medium text-[#d7c6ff]">
                <MessageSquare size={15} />
                Comment
              </button>
              <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#2b2b33] bg-[#121218] px-4 text-sm font-medium text-[#c6c6d0]">
                <Settings size={15} />
                Tweaks
              </button>
            </div>
          </div>

          <div
            ref={canvasRef}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative min-h-0 flex-1 touch-none overflow-hidden bg-[#060609]"
          >
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-[#8f8f9b]">
                <Loader2 size={16} className="mr-2 animate-spin" />
                Loading artifacts
              </div>
            ) : selectedArtifact ? (
              <>
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

                <div className="pointer-events-none absolute right-8 top-6 w-[330px] rounded-xl border border-[#33333c] bg-[#17171d] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="font-semibold text-white">Tweaks</div>
                    <div className="text-xs text-[#777780]">no prompt needed</div>
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#9c9ca8]">
                    Accent
                  </div>
                  <div className="mt-2 flex gap-3">
                    {["#2563eb", "#8b5cf6", "#0f766e", "#dc2626"].map((color, index) => (
                      <span
                        key={color}
                        className={cn(
                          "h-8 w-8 rounded-full",
                          index === 0 ? "ring-2 ring-white ring-offset-2 ring-offset-[#17171d]" : "",
                        )}
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                  <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-[#9c9ca8]">
                    Density
                  </div>
                  <div className="mt-2 grid grid-cols-2 rounded-lg border border-[#33333c] bg-[#101014] p-1 text-sm">
                    <div className="py-1.5 text-center text-[#777780]">Cozy</div>
                    <div className="rounded-md bg-[#2b2b34] py-1.5 text-center font-semibold text-white">
                      Compact
                    </div>
                  </div>
                  <div className="mt-5 flex items-center justify-between text-sm text-[#d7d7df]">
                    <span>Sticky filters</span>
                    <span className="h-6 w-11 rounded-full bg-[#2f65c8] p-0.5">
                      <span className="block h-5 w-5 translate-x-5 rounded-full bg-white" />
                    </span>
                  </div>
                </div>

                <div className="pointer-events-none absolute bottom-[30%] right-9 w-[360px] rounded-xl border border-[#6e55b2] bg-[#171421] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
                  <div className="mb-2 flex items-center gap-2 text-sm">
                    <span className="rounded-full bg-[#2f65c8] px-2 py-1 text-xs font-bold text-white">
                      VS
                    </span>
                    <span className="font-semibold text-white">You</span>
                    <span className="text-[#777780]">on Row 2</span>
                  </div>
                  <p className="text-sm leading-6 text-[#e0ddeb]">
                    This one's over the auto-approve cap — can we flag it visually?
                  </p>
                  <div className="mt-2 text-sm font-medium text-[#c7afff]">
                    ↪ Sends to agent with element attached
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[#8f8f9b]">
                No artifacts yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
