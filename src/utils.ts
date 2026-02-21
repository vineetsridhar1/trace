import type { ServerEvent, ExtractedDiffContent, ThreadRenderNode, DiffRuntime } from './types';

const READ_LIKE_TOOL_NAMES = new Set(['read', 'glob']);
const EDIT_LIKE_TOOL_NAMES = new Set(['edit', 'multiedit', 'write']);

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function avatarInitial(sessionId: string): string {
  return sessionId.slice(0, 2).toUpperCase();
}

export function extractPromptText(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== 'object') {
    return null;
  }

  const record = rawPayload as Record<string, unknown>;
  const candidates = ['prompt', 'text', 'message', 'user_prompt'];

  for (const key of candidates) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

export function serializeUnknown(value: unknown, maxLen = 1000): string {
  try {
    const serialized = JSON.stringify(value, null, 2) ?? '';
    return serialized.length > maxLen ? `${serialized.slice(0, maxLen)}...` : serialized;
  } catch {
    const fallback = String(value ?? '');
    return fallback.length > maxLen ? `${fallback.slice(0, maxLen)}...` : fallback;
  }
}

export function normalizeToolName(toolName: string | null): string {
  return (toolName ?? '').trim().toLowerCase();
}

export function toRelativeDisplayPath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/').trim();
  if (!normalized) {
    return normalized;
  }

  const worktreeMatch = normalized.match(/\/\.trace-worktrees\/[^/]+\/(.+)/);
  if (worktreeMatch?.[1]) {
    return worktreeMatch[1];
  }

  const traceRepoMatch = normalized.match(/\/programming\/trace\/(.+)/);
  if (traceRepoMatch?.[1]) {
    return traceRepoMatch[1];
  }

  if (normalized.startsWith('/')) {
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length > 4) {
      return parts.slice(-4).join('/');
    }
    return parts.join('/');
  }

  return normalized;
}

export function isReadLikeEvent(event: ServerEvent): boolean {
  return event.hookEventName === 'PostToolUse' && READ_LIKE_TOOL_NAMES.has(normalizeToolName(event.toolName));
}

export function isEditLikeEvent(event: ServerEvent): boolean {
  return event.hookEventName === 'PostToolUse' && EDIT_LIKE_TOOL_NAMES.has(normalizeToolName(event.toolName));
}

function findFirstString(value: unknown, depth: number): string | null {
  if (depth < 0 || value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstString(item, depth - 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (typeof value !== 'object') {
    return null;
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    const found = findFirstString(nested, depth - 1);
    if (found) {
      return found;
    }
  }

  return null;
}

export function findStringByKeys(
  value: unknown,
  keys: string[],
  depth = 5,
): string | null {
  if (depth < 0 || value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKeys(item, keys, depth - 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (typeof value !== 'object') {
    return null;
  }

  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  const record = value as Record<string, unknown>;

  for (const [key, nested] of Object.entries(record)) {
    if (!keySet.has(key.toLowerCase())) {
      continue;
    }

    if (typeof nested === 'string' && nested.trim()) {
      return nested.trim();
    }

    const nestedFromMatch = findFirstString(nested, depth - 1);
    if (nestedFromMatch) {
      return nestedFromMatch;
    }
  }

  for (const nested of Object.values(record)) {
    const found = findStringByKeys(nested, keys, depth - 1);
    if (found) {
      return found;
    }
  }

  return null;
}

function normalizeUnifiedDiff(rawDiff: string, filePath: string | null): string | null {
  const trimmed = rawDiff.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes('diff --git') || (trimmed.includes('--- ') && trimmed.includes('+++ '))) {
    return trimmed;
  }

  if (!trimmed.includes('@@')) {
    return null;
  }

  const safePath = filePath && filePath.trim() ? filePath.trim() : 'file.txt';
  return [
    `diff --git a/${safePath} b/${safePath}`,
    `--- a/${safePath}`,
    `+++ b/${safePath}`,
    trimmed,
  ].join('\n');
}

function buildUnifiedDiffFromBeforeAfter(
  filePath: string | null,
  before: string,
  after: string,
): string {
  const safePath = filePath && filePath.trim() ? filePath.trim() : 'file.txt';
  const oldLines = before.split('\n');
  const newLines = after.split('\n');

  return [
    `diff --git a/${safePath} b/${safePath}`,
    `--- a/${safePath}`,
    `+++ b/${safePath}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join('\n');
}

export function extractReadGlobSummary(event: ServerEvent): string {
  const rawPathSnippet =
    findStringByKeys(event.toolInput, ['file_path', 'path', 'filepath', 'relative_path']) ??
    findStringByKeys(event.toolResponse, ['file_path', 'path', 'filepath']) ??
    findStringByKeys(event.rawPayload, ['file_path', 'path']);

  if (rawPathSnippet) {
    const relativePath = toRelativeDisplayPath(rawPathSnippet);
    return relativePath.slice(0, 140);
  }

  const patternSnippet =
    findStringByKeys(event.toolInput, ['pattern', 'glob', 'query']) ??
    findStringByKeys(event.rawPayload, ['pattern', 'glob']);

  if (patternSnippet) {
    return patternSnippet.slice(0, 140);
  }

  return event.toolName ?? 'Read/Glob';
}

export function buildThreadNodes(events: ServerEvent[]): ThreadRenderNode[] {
  const nodes: ThreadRenderNode[] = [];
  let bucket: ServerEvent[] = [];

  const flushBucket = () => {
    if (bucket.length === 0) {
      return;
    }

    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    const summaryLabels = [...new Set(bucket.map((event) => extractReadGlobSummary(event)))].slice(0, 4);

    nodes.push({
      kind: 'readglob-group',
      id: `${first.id}:${last.id}:${bucket.length}`,
      count: bucket.length,
      startTimestamp: first.timestamp,
      endTimestamp: last.timestamp,
      summaryLabels,
      events: bucket,
    });

    bucket = [];
  };

  for (const event of events) {
    if (isReadLikeEvent(event)) {
      bucket.push(event);
      continue;
    }

    flushBucket();
    nodes.push({ kind: 'event', event });
  }

  flushBucket();
  return nodes;
}

export function extractEditDiffContent(event: ServerEvent): ExtractedDiffContent {
  const rawFilePath =
    findStringByKeys(event.toolInput, ['file_path', 'path', 'filepath', 'relative_path']) ??
    findStringByKeys(event.toolResponse, ['file_path', 'path', 'filepath', 'relative_path']) ??
    findStringByKeys(event.rawPayload, ['file_path', 'path', 'filepath', 'relative_path']);
  const filePath = rawFilePath ? toRelativeDisplayPath(rawFilePath) : null;

  const directDiff =
    findStringByKeys(event.toolInput, ['diff', 'patch', 'unified_diff', 'unifiedDiff']) ??
    findStringByKeys(event.toolResponse, ['diff', 'patch', 'unified_diff', 'unifiedDiff']) ??
    findStringByKeys(event.rawPayload, ['diff', 'patch', 'unified_diff', 'unifiedDiff']);

  let diffText = directDiff ? normalizeUnifiedDiff(directDiff, filePath) : null;

  if (!diffText) {
    const before =
      findStringByKeys(event.toolInput, ['old_string', 'oldText', 'before', 'original']) ??
      findStringByKeys(event.toolResponse, ['old_string', 'oldText', 'before', 'original']);

    const after =
      findStringByKeys(event.toolInput, ['new_string', 'newText', 'after', 'replacement']) ??
      findStringByKeys(event.toolResponse, ['new_string', 'newText', 'after', 'replacement']);

    if (before !== null && after !== null) {
      diffText = buildUnifiedDiffFromBeforeAfter(filePath, before, after);
    }
  }

  const fallbackText = serializeUnknown(
    {
      toolInput: event.toolInput,
      toolResponse: event.toolResponse,
    },
    3500,
  );

  const title = `${event.toolName ?? 'Edit'}${filePath ? ` · ${filePath}` : ''}`;

  return {
    title,
    filePath: filePath ?? null,
    diffText,
    fallbackText,
  };
}

let diffRuntimePromise: Promise<DiffRuntime | null> | null = null;

export async function loadDiffRuntime(): Promise<DiffRuntime | null> {
  if (!diffRuntimePromise) {
    diffRuntimePromise = (async () => {
      try {
        const module = await import('react-diff-view');
        await import('react-diff-view/style/index.css');

        const runtime = module as unknown as Partial<DiffRuntime>;
        if (!runtime.Diff || !runtime.Hunk || typeof runtime.parseDiff !== 'function') {
          return null;
        }

        return runtime as DiffRuntime;
      } catch {
        return null;
      }
    })();
  }

  return diffRuntimePromise;
}
