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
import type { Artifact, Event } from "@trace/gql";
import {
  eventScopeKey,
  useEntitiesByIds,
  useEntityIds,
  useEntityStore,
  useScopedEvents,
} from "@trace/client-core";
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
  mutation IterateDesignArtifact($artifactId: ID!, $prompt: String!) {
    iterateDesignArtifact(artifactId: $artifactId, prompt: $prompt) {
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

type CanvasArtifact = Pick<
  Artifact,
  | "id"
  | "sessionGroupId"
  | "parentArtifactId"
  | "prompt"
  | "title"
  | "contentType"
  | "html"
  | "metadata"
  | "publishedAt"
  | "publicUrl"
  | "createdAt"
  | "updatedAt"
>;

type StreamingArtifact = CanvasArtifact & {
  streaming: true;
  generationId: string;
  failed?: boolean;
};

export type DesignAnchor = {
  type: "artifact" | "element";
  dataEl?: string;
  text?: string;
  x?: number;
  y?: number;
};

export type DesignComment = {
  id: string;
  artifactId: string;
  body: string;
  anchor: DesignAnchor | null;
  sendToAgent: boolean;
  timestamp: string;
};

const CARD_WIDTH = 720;
const CARD_HEIGHT = 520;
const CARD_GAP = 80;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const USER_CONTENT_ORIGIN = import.meta.env.VITE_TRACE_USER_CONTENT_ORIGIN?.trim() || null;
const SRC_DOC_PREVIEW_FALLBACK_ENABLED = import.meta.env.DEV === true;

type Viewport = {
  x: number;
  y: number;
  scale: number;
};

type ArtifactPlacement = {
  artifact: CanvasArtifact;
  x: number;
  y: number;
};

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function getArtifactPlacements(artifacts: CanvasArtifact[]): ArtifactPlacement[] {
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

function createProtocolNonce() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

export function buildDesignArtifactBootstrapUrl(input: {
  artifactId: string;
  userContentOrigin: string | null;
  parentOrigin: string;
  nonce: string;
}) {
  if (!input.userContentOrigin) return null;
  try {
    const url = new URL(input.userContentOrigin);
    url.hostname = `${input.artifactId}.${url.hostname}`;
    url.pathname = "/_bootstrap";
    url.searchParams.set("parentOrigin", input.parentOrigin);
    url.searchParams.set("nonce", input.nonce);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function getArtifactBootstrapUrl(artifactId: string, nonce: string) {
  return buildDesignArtifactBootstrapUrl({
    artifactId,
    userContentOrigin: USER_CONTENT_ORIGIN,
    parentOrigin: window.location.origin,
    nonce,
  });
}

export function buildDesignArtifactPublicUrlFromOrigin(
  artifact: Pick<Artifact, "id" | "publishedAt" | "publicUrl">,
  userContentOrigin: string | null,
) {
  if (artifact.publicUrl) return artifact.publicUrl;
  if (!artifact.publishedAt || !userContentOrigin) return null;
  try {
    const url = new URL(userContentOrigin);
    url.hostname = `${artifact.id}.${url.hostname}`;
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function getArtifactPublicUrl(artifact: Artifact) {
  return buildDesignArtifactPublicUrlFromOrigin(artifact, USER_CONTENT_ORIGIN);
}

export function getDesignArtifactPreviewMode(
  userContentOrigin: string | null,
  srcDocFallbackEnabled: boolean,
) {
  if (userContentOrigin) return "bootstrap";
  return srcDocFallbackEnabled ? "srcdoc" : "unavailable";
}

function eventPayload(event: Event): Record<string, unknown> | null {
  return event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? (event.payload as Record<string, unknown>)
    : null;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function objectField(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalizeDesignAnchor(value: unknown): DesignAnchor | null {
  const anchor = objectField(value);
  if (!anchor) return null;

  const type = anchor.type === "artifact" || anchor.type === "element" ? anchor.type : "element";
  const dataEl = stringField(anchor.dataEl) ?? stringField(anchor.id);
  const text = stringField(anchor.text);
  const x = numberField(anchor.x);
  const y = numberField(anchor.y);
  if (type === "element" && !dataEl) return null;

  return {
    type,
    ...(dataEl ? { dataEl } : {}),
    ...(text ? { text } : {}),
    ...(type === "artifact" && x != null && y != null ? { x, y } : {}),
  };
}

export function designCommentFromEvent(event: Event): DesignComment | null {
  if (event.eventType !== "design_comment_added") return null;
  const payload = eventPayload(event);
  if (!payload) return null;
  const artifactId = stringField(payload.artifactId);
  const body = stringField(payload.body);
  if (!artifactId || !body) return null;
  return {
    id: event.id,
    artifactId,
    body,
    anchor: normalizeDesignAnchor(payload.anchor),
    sendToAgent: payload.sendToAgent === true,
    timestamp: event.timestamp,
  };
}

function streamingArtifactFromPayload(payload: Record<string, unknown>): StreamingArtifact | null {
  const generationId = stringField(payload.generationId);
  const sessionGroupId = stringField(payload.sessionGroupId);
  const html = stringField(payload.htmlPreview);
  if (!generationId || !sessionGroupId || !html) return null;
  const directionIndex = numberField(payload.directionIndex);
  const directionLabel = stringField(payload.directionLabel);
  const title =
    directionLabel ??
    (directionIndex != null ? `Direction ${directionIndex + 1}` : "Generating design");
  const now = new Date().toISOString();
  return {
    id: `stream:${generationId}`,
    generationId,
    streaming: true,
    sessionGroupId,
    parentArtifactId: stringField(payload.parentArtifactId),
    prompt: stringField(payload.prompt),
    title,
    contentType: "text/html+trace-design",
    html,
    metadata: { streaming: true },
    publishedAt: null,
    publicUrl: null,
    createdAt: now,
    updatedAt: now,
  };
}

function failedGenerationArtifactFromPayload(
  payload: Record<string, unknown>,
): StreamingArtifact | null {
  const generationId = stringField(payload.generationId);
  const sessionGroupId = stringField(payload.sessionGroupId);
  if (!generationId || !sessionGroupId) return null;
  const directionIndex = numberField(payload.directionIndex);
  const directionLabel = stringField(payload.directionLabel);
  const error = stringField(payload.error) ?? "Design generation failed.";
  const escapedError = escapeHtml(error);
  const title =
    directionLabel ??
    (directionIndex != null ? `Direction ${directionIndex + 1}` : "Generation failed");
  const now = new Date().toISOString();
  return {
    id: `failed:${generationId}`,
    generationId,
    streaming: true,
    failed: true,
    sessionGroupId,
    parentArtifactId: stringField(payload.parentArtifactId),
    prompt: stringField(payload.prompt),
    title,
    contentType: "text/html+trace-design",
    html: `<!doctype html><html><body><main style="font:14px system-ui;padding:24px;color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;"><strong>Design generation failed</strong><p>${escapedError}</p></main></body></html>`,
    metadata: { streaming: true, failed: true, error },
    publishedAt: null,
    publicUrl: null,
    createdAt: now,
    updatedAt: now,
  };
}

function artifactGenerationId(artifact: CanvasArtifact): string | null {
  const metadata = objectField(artifact.metadata);
  return stringField(metadata?.generationId);
}

function commentsByArtifact(events: Record<string, Event>): Record<string, DesignComment[]> {
  const comments: Record<string, DesignComment[]> = {};
  for (const event of Object.values(events)) {
    const comment = designCommentFromEvent(event);
    if (!comment) continue;
    comments[comment.artifactId] = [...(comments[comment.artifactId] ?? []), comment];
  }
  return comments;
}

export function streamingArtifactsFromEvents(
  events: Record<string, Event>,
  persistedArtifacts: CanvasArtifact[],
): Record<string, StreamingArtifact> {
  const persistedGenerationIds = new Set(
    persistedArtifacts
      .map((artifact) => artifactGenerationId(artifact))
      .filter((id): id is string => id !== null),
  );
  const streaming: Record<string, StreamingArtifact> = {};
  for (const event of Object.values(events)) {
    const payload = eventPayload(event);
    if (payload && event.eventType === "design_generation_failed") {
      const artifact = failedGenerationArtifactFromPayload(payload);
      if (!artifact || persistedGenerationIds.has(artifact.generationId)) continue;
      streaming[artifact.generationId] = artifact;
      continue;
    }
    if (
      !payload ||
      event.eventType !== "session_output" ||
      (payload.type !== "design_generation_delta" && payload.type !== "design_generation_completed")
    ) {
      continue;
    }
    const artifact = streamingArtifactFromPayload(payload);
    if (!artifact || persistedGenerationIds.has(artifact.generationId)) continue;
    streaming[artifact.generationId] = artifact;
  }
  return streaming;
}

function anchorLabel(anchor: DesignAnchor | null): string {
  if (!anchor) return "Artifact";
  if (anchor.type === "artifact") return "Artifact";
  return anchor.dataEl ? `[data-el="${anchor.dataEl}"]` : "Element";
}

export function designCommentsForPreview(comments: DesignComment[]) {
  return comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    anchor: comment.anchor,
  }));
}

function ArtifactCard({
  artifact,
  selected,
  selectedAnchor,
  comments,
  onAnchorSelected,
}: {
  artifact: CanvasArtifact;
  selected: boolean;
  selectedAnchor: DesignAnchor | null;
  comments: DesignComment[];
  onAnchorSelected: (artifactId: string, anchor: DesignAnchor) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const nonceRef = useRef<string>(createProtocolNonce());
  const bootstrapUrl = useMemo(
    () => getArtifactBootstrapUrl(artifact.id, nonceRef.current),
    [artifact.id],
  );
  const previewMode = getDesignArtifactPreviewMode(
    USER_CONTENT_ORIGIN,
    SRC_DOC_PREVIEW_FALLBACK_ENABLED,
  );
  const bootstrapOrigin = useMemo(
    () => (bootstrapUrl ? new URL(bootstrapUrl).origin : null),
    [bootstrapUrl],
  );
  const postArtifactHtml = useCallback(() => {
    const target = iframeRef.current?.contentWindow;
    if (!target || !bootstrapOrigin) return;
    target.postMessage(
      {
        type: "trace:artifact:render",
        html: artifact.html,
        overlayEnabled: true,
        comments: designCommentsForPreview(comments),
        nonce: nonceRef.current,
      },
      bootstrapOrigin,
    );
  }, [artifact.html, bootstrapOrigin, comments]);

  useEffect(() => {
    if (bootstrapUrl) postArtifactHtml();
  }, [bootstrapUrl, postArtifactHtml]);

  useEffect(() => {
    if (!bootstrapOrigin) return;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== bootstrapOrigin || event.source !== iframeRef.current?.contentWindow) {
        return;
      }
      const data = event.data as {
        type?: string;
        nonce?: string;
        message?: string;
        anchor?: unknown;
      } | null;
      if (!data || data.nonce !== nonceRef.current) return;
      if (data.type === "trace:artifact:ready") {
        postArtifactHtml();
      } else if (data.type === "trace:artifact:error") {
        toast.error(data.message ?? "Artifact preview error");
      } else if (data.type === "trace:artifact:element-selected") {
        const anchor = normalizeDesignAnchor(data.anchor);
        if (!anchor) return;
        onAnchorSelected(artifact.id, anchor);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [artifact.id, bootstrapOrigin, onAnchorSelected, postArtifactHtml]);

  return (
    <article
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-background shadow-sm",
        selected ? "border-primary" : "border-border",
      )}
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b px-3">
        <div className="min-w-0 truncate text-sm font-medium">{artifact.title}</div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {selectedAnchor ? (
            <span className="max-w-48 truncate rounded-sm bg-primary/10 px-1.5 py-0.5 text-primary">
              {anchorLabel(selectedAnchor)}
            </span>
          ) : null}
          <span>
            {new Date(artifact.createdAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
      {bootstrapUrl && previewMode === "bootstrap" ? (
        <iframe
          ref={iframeRef}
          title={artifact.title}
          src={bootstrapUrl}
          sandbox="allow-scripts allow-same-origin"
          className="min-h-0 flex-1 bg-white"
          onLoad={postArtifactHtml}
        />
      ) : previewMode === "srcdoc" ? (
        <iframe
          title={artifact.title}
          srcDoc={artifact.html}
          sandbox="allow-scripts"
          className="min-h-0 flex-1 bg-white"
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/20 px-6 text-center text-sm leading-6 text-muted-foreground">
          Configure VITE_TRACE_USER_CONTENT_ORIGIN to preview design artifacts.
        </div>
      )}
      {comments.length > 0 ? (
        <div className="flex max-h-28 shrink-0 flex-col gap-1 overflow-y-auto border-t bg-background/95 px-3 py-2">
          {comments.slice(-3).map((comment) => (
            <div key={comment.id} className="min-w-0 text-xs leading-5">
              <span className="mr-1 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {anchorLabel(comment.anchor)}
              </span>
              <span className="text-foreground">{comment.body}</span>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function DesignCanvas({
  sessionGroupId,
  sessionId,
}: {
  sessionGroupId: string;
  sessionId?: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [selectedAnchors, setSelectedAnchors] = useState<Record<string, DesignAnchor>>({});
  const [viewport, setViewport] = useState<Viewport>({ x: 80, y: 60, scale: 0.8 });
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    viewport: Viewport;
  } | null>(null);

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
  const selectedArtifact = useMemo(
    () =>
      visibleArtifacts.find((artifact) => artifact.id === selectedArtifactId) ??
      visibleArtifacts[0] ??
      null,
    [selectedArtifactId, visibleArtifacts],
  );
  const selectedPersistedArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === selectedArtifact?.id) ?? null,
    [artifacts, selectedArtifact?.id],
  );
  const placements = useMemo(() => getArtifactPlacements(visibleArtifacts), [visibleArtifacts]);
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
    setSelectedArtifactId(artifactId);
    setSelectedAnchors((current) => ({ ...current, [artifactId]: anchor }));
    toast.success("Element selected", { description: anchorLabel(anchor) });
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

  const handleIterate = useCallback(() => {
    if (!selectedPersistedArtifact) return;
    const prompt = window.prompt(
      "Describe the next variant",
      selectedPersistedArtifact.prompt ?? "",
    );
    if (!prompt?.trim()) return;
    void mutateSelectedArtifact(
      ITERATE_DESIGN_ARTIFACT_MUTATION,
      { artifactId: selectedPersistedArtifact.id, prompt: prompt.trim() },
      "Variant created",
    );
  }, [mutateSelectedArtifact, selectedPersistedArtifact]);

  const handleGenerateDirections = useCallback(() => {
    const prompt = window.prompt("Describe the design directions");
    if (!prompt?.trim()) return;
    void mutateSelectedArtifact(
      GENERATE_DESIGN_ARTIFACTS_MUTATION,
      { sessionGroupId, prompt: prompt.trim(), directionCount: 3 },
      "Directions generated",
    );
  }, [mutateSelectedArtifact, sessionGroupId]);

  const handleTweak = useCallback(() => {
    if (!selectedPersistedArtifact) return;
    const name = window.prompt("CSS variable name", "--trace-accent");
    if (!name?.trim()) return;
    const value = window.prompt("CSS variable value", "#0f766e");
    if (!value?.trim()) return;
    void mutateSelectedArtifact(
      PATCH_DESIGN_ARTIFACT_TOKENS_MUTATION,
      { artifactId: selectedPersistedArtifact.id, tokens: { [name.trim()]: value.trim() } },
      "Tweak applied",
    );
  }, [mutateSelectedArtifact, selectedPersistedArtifact]);

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

  const handleComment = useCallback(() => {
    if (!selectedPersistedArtifact) return;
    const body = window.prompt("Add a comment");
    if (!body?.trim()) return;
    const sendToAgent = window.confirm("Send this comment to the agent for the next iteration?");
    void mutateSelectedArtifact(
      COMMENT_DESIGN_ARTIFACT_MUTATION,
      {
        artifactId: selectedPersistedArtifact.id,
        body: body.trim(),
        anchor: selectedAnchor,
        sendToAgent,
      },
      "Comment added",
    );
  }, [mutateSelectedArtifact, selectedAnchor, selectedPersistedArtifact]);

  const handleExportPdf = useCallback(() => {
    if (!selectedPersistedArtifact) return;
    void mutateSelectedArtifact(
      EXPORT_DESIGN_ARTIFACT_PDF_MUTATION,
      { artifactId: selectedPersistedArtifact.id },
      "PDF export queued",
    );
  }, [mutateSelectedArtifact, selectedPersistedArtifact]);

  const handlePromote = useCallback(() => {
    if (!selectedPersistedArtifact) return;
    void mutateSelectedArtifact(
      PROMOTE_DESIGN_ARTIFACT_MUTATION,
      { artifactId: selectedPersistedArtifact.id },
      "Coding session created",
    );
  }, [mutateSelectedArtifact, selectedPersistedArtifact]);

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
          onClick={handleGenerateDirections}
          className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground"
          aria-label="Generate directions"
          title="Generate directions"
        >
          <Wand2 size={14} />
        </button>
        <button
          type="button"
          onClick={handleIterate}
          disabled={!selectedPersistedArtifact}
          className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40"
          aria-label="Create variant"
          title="Create variant"
        >
          <Wand2 size={14} />
        </button>
        <button
          type="button"
          onClick={handleTweak}
          disabled={!selectedPersistedArtifact}
          className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40"
          aria-label="Tweak tokens"
          title="Tweak tokens"
        >
          <SlidersHorizontal size={14} />
        </button>
        <button
          type="button"
          onClick={handleComment}
          disabled={!selectedPersistedArtifact}
          className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40"
          aria-label="Comment"
          title="Comment"
        >
          <MessageSquare size={14} />
        </button>
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
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={!selectedPersistedArtifact}
          className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground disabled:opacity-40"
          aria-label="Export PDF"
          title="Export PDF"
        >
          <FileDown size={14} />
        </button>
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
