import type { Artifact, Event } from "@trace/gql";

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

export const CARD_WIDTH = 720;
export const CARD_HEIGHT = 520;
export const CARD_GAP = 80;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;

export type ArtifactPlacement = {
  artifact: CanvasArtifact;
  x: number;
  y: number;
};

export type DesignPreviewDevice = "desktop" | "tablet" | "mobile";

export const DESIGN_PREVIEW_DEVICES: Array<{
  id: DesignPreviewDevice;
  label: string;
  width: number;
  height: number;
}> = [
  { id: "desktop", label: "Desktop", width: 1280, height: 900 },
  { id: "tablet", label: "Tablet", width: 820, height: 1080 },
  { id: "mobile", label: "Mobile", width: 390, height: 844 },
];

export function clampZoom(value: number): number {
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

export function getCanvasBounds(placements: ArtifactPlacement[]) {
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

export function createProtocolNonce() {
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

export function commentsByArtifact(events: Record<string, Event>): Record<string, DesignComment[]> {
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

export function anchorLabel(anchor: DesignAnchor | null): string {
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
