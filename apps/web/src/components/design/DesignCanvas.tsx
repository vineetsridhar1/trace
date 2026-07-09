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
  GitBranchPlus,
  Loader2,
  Maximize2,
  Minus,
  Minimize2,
  Monitor,
  Plus,
  Smartphone,
  Tablet,
  Upload,
  Wand2,
} from "lucide-react";
import type { Artifact, Event } from "@trace/gql";
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
import {
  DesignPdfExportPopover,
  type DesignPdfPageOptions,
} from "./DesignPdfExportPopover";
import { DesignTweaksPopover } from "./DesignTweaksPopover";
import { navigateToSession } from "../../stores/ui";

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

const REPORT_DESIGN_ARTIFACT_ERROR_MUTATION = gql`
  mutation ReportDesignArtifactError($artifactId: ID!, $message: String!, $stack: String) {
    reportDesignArtifactError(artifactId: $artifactId, message: $message, stack: $stack) {
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

export type CanvasArtifact = Pick<
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
  bounds?: {
    left: number;
    top: number;
    width: number;
    height: number;
    x?: number;
    y?: number;
  };
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

export type ArtifactPlacement = {
  artifact: CanvasArtifact;
  x: number;
  y: number;
};

export type DesignPreviewDevice = "desktop" | "tablet" | "mobile";

const DESIGN_PREVIEW_DEVICES: Array<{
  id: DesignPreviewDevice;
  label: string;
  width: number;
  height: number;
}> = [
  { id: "desktop", label: "Desktop", width: 1280, height: 900 },
  { id: "tablet", label: "Tablet", width: 820, height: 1080 },
  { id: "mobile", label: "Mobile", width: 390, height: 844 },
];

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function getDesignPreviewDeviceFrame(device: DesignPreviewDevice) {
  return DESIGN_PREVIEW_DEVICES.find((item) => item.id === device) ?? DESIGN_PREVIEW_DEVICES[0];
}

export function clampDesignPreviewScale(value: number): number {
  return Math.min(1.25, Math.max(0.35, value));
}

export function getArtifactPlacements(artifacts: CanvasArtifact[]): ArtifactPlacement[] {
  const artifactIds = new Set(artifacts.map((artifact) => artifact.id));
  const childrenByParentId = new Map<string, CanvasArtifact[]>();
  const roots: CanvasArtifact[] = [];

  for (const artifact of artifacts) {
    const parentId = artifact.parentArtifactId;
    if (parentId && artifactIds.has(parentId)) {
      childrenByParentId.set(parentId, [...(childrenByParentId.get(parentId) ?? []), artifact]);
    } else {
      roots.push(artifact);
    }
  }

  const placements: ArtifactPlacement[] = [];
  const verticalStep = CARD_HEIGHT + CARD_GAP;

  const placeDescendants = (artifact: CanvasArtifact, x: number, y: number): number => {
    let cursorY = y;
    const children = childrenByParentId.get(artifact.id) ?? [];
    for (const child of children) {
      cursorY += verticalStep;
      placements.push({ artifact: child, x, y: cursorY });
      cursorY = placeDescendants(child, x, cursorY);
    }
    return cursorY;
  };

  roots.forEach((artifact, index) => {
    const x = index * (CARD_WIDTH + CARD_GAP);
    placements.push({ artifact, x, y: 0 });
    placeDescendants(artifact, x, 0);
  });

  return placements;
}

export function updateDesignArtifactSelection(
  currentSelection: string[],
  artifactId: string,
  additive: boolean,
): string[] {
  if (!additive) return [artifactId];
  if (currentSelection.includes(artifactId)) {
    return currentSelection.filter((selectedId) => selectedId !== artifactId);
  }
  return [...currentSelection, artifactId].slice(-2);
}

export function getArtifactLineageStrip(
  artifacts: CanvasArtifact[],
  selectedArtifactId: string | null,
): CanvasArtifact[] {
  if (!selectedArtifactId) return [];
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const selected = byId.get(selectedArtifactId);
  if (!selected) return [];

  const ancestorIds: string[] = [];
  const seen = new Set<string>([selected.id]);
  let cursor = selected;
  while (cursor.parentArtifactId) {
    const parent = byId.get(cursor.parentArtifactId);
    if (!parent || seen.has(parent.id)) break;
    ancestorIds.unshift(parent.id);
    seen.add(parent.id);
    cursor = parent;
  }

  const childrenByParentId = new Map<string, CanvasArtifact[]>();
  for (const artifact of artifacts) {
    if (!artifact.parentArtifactId || !byId.has(artifact.parentArtifactId)) continue;
    childrenByParentId.set(artifact.parentArtifactId, [
      ...(childrenByParentId.get(artifact.parentArtifactId) ?? []),
      artifact,
    ]);
  }

  const lineageIds = [...ancestorIds, selected.id];
  const appendDescendants = (artifactId: string) => {
    for (const child of childrenByParentId.get(artifactId) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      lineageIds.push(child.id);
      appendDescendants(child.id);
    }
  };
  appendDescendants(selected.id);

  return lineageIds
    .map((artifactId) => byId.get(artifactId))
    .filter((artifact): artifact is CanvasArtifact => artifact !== undefined);
}

export function buildDesignIterationPromptDefault(selectedArtifacts: CanvasArtifact[]): string {
  if (selectedArtifacts.length >= 2) {
    const [primary, comparison] = selectedArtifacts;
    return `Merge ${primary?.title ?? "the first direction"} with ${
      comparison?.title ?? "the second direction"
    }. Keep the strongest structure from the first and the strongest visual system from the second.`;
  }
  return selectedArtifacts[0]?.prompt ?? "";
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

export function designArtifactErrorReport(input: {
  artifactId: string;
  message?: string | null;
  stack?: string | null;
}) {
  return {
    artifactId: input.artifactId,
    message: input.message?.trim() || "Artifact preview error",
    stack: input.stack?.trim() || null,
  };
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

function normalizeAnchorBounds(value: unknown): DesignAnchor["bounds"] | undefined {
  const bounds = objectField(value);
  if (!bounds) return undefined;
  const left = numberField(bounds.left);
  const top = numberField(bounds.top);
  const width = numberField(bounds.width);
  const height = numberField(bounds.height);
  if (left == null || top == null || width == null || height == null) return undefined;
  const x = numberField(bounds.x);
  const y = numberField(bounds.y);
  return {
    left,
    top,
    width,
    height,
    ...(x != null ? { x } : {}),
    ...(y != null ? { y } : {}),
  };
}

export function normalizeDesignAnchor(value: unknown): DesignAnchor | null {
  const anchor = objectField(value);
  if (!anchor) return null;

  const type = anchor.type === "artifact" || anchor.type === "element" ? anchor.type : "element";
  const dataEl = stringField(anchor.dataEl) ?? stringField(anchor.id);
  const text = stringField(anchor.text);
  const x = numberField(anchor.x);
  const y = numberField(anchor.y);
  const bounds = normalizeAnchorBounds(anchor.bounds);
  if (type === "element" && !dataEl) return null;

  return {
    type,
    ...(dataEl ? { dataEl } : {}),
    ...(text ? { text } : {}),
    ...(type === "artifact" && x != null && y != null ? { x, y } : {}),
    ...(type === "element" && bounds ? { bounds } : {}),
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

export function promotedSessionTarget(value: unknown): {
  sessionId: string;
  sessionGroupId: string;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const promoted = value as { id?: unknown; sessionGroupId?: unknown };
  return typeof promoted.id === "string" && typeof promoted.sessionGroupId === "string"
    ? { sessionId: promoted.id, sessionGroupId: promoted.sessionGroupId }
    : null;
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
  const [device, setDevice] = useState<DesignPreviewDevice>("desktop");
  const [previewScale, setPreviewScale] = useState(0.55);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const nonceRef = useRef<string>(createProtocolNonce());
  const reportedErrorKeysRef = useRef<Set<string>>(new Set());
  const frame = getDesignPreviewDeviceFrame(device);
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
        stack?: string;
        anchor?: unknown;
      } | null;
      if (!data || data.nonce !== nonceRef.current) return;
      if (data.type === "trace:artifact:ready") {
        postArtifactHtml();
      } else if (data.type === "trace:artifact:error") {
        const report = designArtifactErrorReport({
          artifactId: artifact.id,
          message: data.message,
          stack: data.stack,
        });
        toast.error(report.message);
        const reportKey = `${report.message}\n${report.stack ?? ""}`;
        if (!reportedErrorKeysRef.current.has(reportKey)) {
          reportedErrorKeysRef.current.add(reportKey);
          void client
            .mutation(REPORT_DESIGN_ARTIFACT_ERROR_MUTATION, report)
            .toPromise()
            .catch(() => undefined);
        }
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
      <div className="flex h-8 shrink-0 items-center justify-between border-b px-2">
        <div className="flex overflow-hidden rounded-md border border-border">
          {DESIGN_PREVIEW_DEVICES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDevice(item.id)}
              className={cn(
                "inline-flex h-6 w-7 items-center justify-center border-r text-muted-foreground last:border-r-0 hover:text-foreground",
                item.id === device ? "bg-primary/10 text-primary" : undefined,
              )}
              aria-label={`${item.label} preview`}
              title={`${item.label} preview`}
            >
              {item.id === "desktop" ? (
                <Monitor size={13} />
              ) : item.id === "tablet" ? (
                <Tablet size={13} />
              ) : (
                <Smartphone size={13} />
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center overflow-hidden rounded-md border border-border">
          <button
            type="button"
            onClick={() => setPreviewScale((value) => clampDesignPreviewScale(value - 0.1))}
            className="inline-flex h-6 w-7 items-center justify-center border-r text-muted-foreground hover:text-foreground"
            aria-label="Zoom preview out"
            title="Zoom preview out"
          >
            <Minus size={12} />
          </button>
          <div className="w-10 text-center text-[11px] tabular-nums text-muted-foreground">
            {Math.round(previewScale * 100)}%
          </div>
          <button
            type="button"
            onClick={() => setPreviewScale((value) => clampDesignPreviewScale(value + 0.1))}
            className="inline-flex h-6 w-7 items-center justify-center border-l text-muted-foreground hover:text-foreground"
            aria-label="Zoom preview in"
            title="Zoom preview in"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
      {bootstrapUrl && previewMode === "bootstrap" ? (
        <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
          <div
            className="mx-auto overflow-hidden rounded-md border border-border bg-white shadow-sm"
            style={{
              width: frame.width * previewScale,
              height: frame.height * previewScale,
            }}
          >
            <iframe
              ref={iframeRef}
              title={artifact.title}
              src={bootstrapUrl}
              sandbox="allow-scripts allow-same-origin"
              className="h-full w-full origin-top-left bg-white"
              style={{
                width: frame.width,
                height: frame.height,
                transform: `scale(${previewScale})`,
              }}
              onLoad={postArtifactHtml}
            />
          </div>
        </div>
      ) : previewMode === "srcdoc" ? (
        <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
          <div
            className="mx-auto overflow-hidden rounded-md border border-border bg-white shadow-sm"
            style={{
              width: frame.width * previewScale,
              height: frame.height * previewScale,
            }}
          >
            <iframe
              title={artifact.title}
              srcDoc={artifact.html}
              sandbox="allow-scripts"
              className="h-full w-full origin-top-left bg-white"
              style={{
                width: frame.width,
                height: frame.height,
                transform: `scale(${previewScale})`,
              }}
            />
          </div>
        </div>
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

  const handleIterate = useCallback(() => {
    if (!selectedPersistedArtifact) return;
    const prompt = window.prompt(
      selectedPersistedArtifacts.length >= 2
        ? "Describe the comparative variant"
        : "Describe the next variant",
      buildDesignIterationPromptDefault(promptDefaultArtifacts),
    );
    if (!prompt?.trim()) return;
    const comparisonArtifactIds = promptDefaultArtifacts
      .slice(1)
      .map((artifact) => artifact.id)
      .filter((artifactId) => artifactId !== selectedPersistedArtifact.id);
    void mutateSelectedArtifact(
      ITERATE_DESIGN_ARTIFACT_MUTATION,
      {
        artifactId: selectedPersistedArtifact.id,
        prompt: prompt.trim(),
        comparisonArtifactIds: comparisonArtifactIds.length > 0 ? comparisonArtifactIds : null,
      },
      "Variant created",
    );
  }, [
    mutateSelectedArtifact,
    promptDefaultArtifacts,
    selectedPersistedArtifact,
    selectedPersistedArtifacts.length,
  ]);

  const handleGenerateDirections = useCallback(() => {
    const prompt = window.prompt("Describe the design directions");
    if (!prompt?.trim()) return;
    void mutateSelectedArtifact(
      GENERATE_DESIGN_ARTIFACTS_MUTATION,
      { sessionGroupId, prompt: prompt.trim(), directionCount: 3 },
      "Directions generated",
    );
  }, [mutateSelectedArtifact, sessionGroupId]);

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
        <button
          type="button"
          onClick={handleGenerateDirections}
          className="inline-flex h-8 w-8 items-center justify-center border-r text-muted-foreground hover:text-foreground"
          aria-label="Generate directions"
          title="Generate directions"
        >
          <Wand2 size={14} />
        </button>
        <div className="inline-flex h-8 items-center border-r px-2 text-xs tabular-nums text-muted-foreground">
          {selectedArtifactIds.length === 0 ? "None" : `${selectedArtifactIds.length} selected`}
        </div>
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
              <ArtifactCard
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
              <ArtifactCard
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
