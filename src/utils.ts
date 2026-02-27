import type { ServerEvent, ExtractedDiffContent, SessionRenderNode, CollapsedTurnGroupNode, DiffRuntime, Question } from './types';

export function stripTraceInternal(text: string): string {
  return text.replace(/<trace-internal>[\s\S]*?<\/trace-internal>\s*/g, '');
}

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

export interface RawPayloadAttachment {
  id: string;
  key: string;
  filename: string;
  contentType: string;
  url: string;
  localPath: string;
}

export function extractAttachments(rawPayload: unknown): RawPayloadAttachment[] {
  if (!rawPayload || typeof rawPayload !== 'object') return [];
  const record = rawPayload as Record<string, unknown>;
  if (!Array.isArray(record.attachments)) return [];
  return record.attachments as RawPayloadAttachment[];
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

  const worktreeMatch = normalized.match(/\/worktrees\/[0-9a-f-]{36}\/(.+)/);
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
  allowEmpty = false,
): string | null {
  if (depth < 0 || value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKeys(item, keys, depth - 1, allowEmpty);
      if (found !== null && (allowEmpty || found)) {
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

    if (typeof nested === 'string') {
      if (allowEmpty || nested.trim()) {
        return allowEmpty ? nested : nested.trim();
      }
    }

    const nestedFromMatch = findFirstString(nested, depth - 1);
    if (nestedFromMatch) {
      return nestedFromMatch;
    }
  }

  for (const nested of Object.values(record)) {
    const found = findStringByKeys(nested, keys, depth - 1, allowEmpty);
    if (found !== null && (allowEmpty || found)) {
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


export function buildSessionNodes(events: ServerEvent[]): SessionRenderNode[] {
  const nodes: SessionRenderNode[] = [];
  let bucket: ServerEvent[] = [];

  // Build a set of toolUseIds that have a PostToolUse (completed subagents).
  // PreToolUse events whose toolUseId is in this set are superseded and should be skipped.
  const completedToolUseIds = new Set<string>();
  for (const event of events) {
    if (event.hookEventName === 'PostToolUse' && event.toolUseId) {
      completedToolUseIds.add(event.toolUseId);
    }
  }

  const flushBucket = () => {
    if (bucket.length === 0) {
      return;
    }

    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    const summaryLabels = [...new Set(bucket.map((event) => extractReadGlobSummary(event)))].slice(0, 4);

    nodes.push({
      kind: 'readglob-group',
      id: `readglob-${first.id}`,
      count: bucket.length,
      startTimestamp: first.timestamp,
      endTimestamp: last.timestamp,
      summaryLabels,
      events: bucket,
    });

    bucket = [];
  };

  let currentSessionId: string | null = null;
  for (const event of events) {
    // Insert session divider when sessionId changes (multi-session boundary)
    if (currentSessionId !== null && event.sessionId !== currentSessionId) {
      flushBucket();
      nodes.push({
        kind: 'session-divider',
        id: `session-divider-${event.id}`,
        timestamp: event.timestamp,
      });
    }
    currentSessionId = event.sessionId;

    // Skip PreToolUse events that already have a matching PostToolUse (completed)
    if (event.hookEventName === 'PreToolUse' && event.toolUseId && completedToolUseIds.has(event.toolUseId)) {
      continue;
    }

    if (isReadLikeEvent(event)) {
      bucket.push(event);
      continue;
    }

    flushBucket();
    nodes.push({ kind: 'event', event });
  }

  flushBucket();

  // Only keep the last TodoWrite event — each one replaces the previous
  let lastTodoIdx = -1;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (
      n.kind === 'event' &&
      n.event.hookEventName === 'PostToolUse' &&
      normalizeToolName(n.event.toolName) === 'todowrite'
    ) {
      if (lastTodoIdx === -1) {
        lastTodoIdx = i;
      } else {
        nodes.splice(i, 1);
        lastTodoIdx--;
      }
    }
  }

  // Detect plan sequences: a Stop event preceded by a Write/Edit of a .md plan file
  // (Claude writes the plan, then exits — user sees plan review UI to approve/reject)
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.kind !== 'event' || n.event.hookEventName !== 'Stop') continue;

    const hasExitPlanMode = n.event.toolName === 'ExitPlanMode';

    // Look backwards for a Write or Edit event that modified a plan .md file
    let planContent = '';
    let planFilePath = '';
    let planToolIdx = -1;
    for (let j = i - 1; j >= 0; j--) {
      const candidate = nodes[j];
      if (candidate.kind !== 'event') continue;
      // Stop searching if we hit another Stop or UserPromptSubmit (different turn)
      if (
        candidate.event.hookEventName === 'Stop' ||
        candidate.event.hookEventName === 'UserPromptSubmit'
      ) {
        break;
      }
      if (candidate.event.hookEventName === 'PostToolUse') {
        const tool = normalizeToolName(candidate.event.toolName);
        if (tool === 'write' || tool === 'edit') {
          const filePath = findStringByKeys(candidate.event.toolInput, ['file_path', 'path', 'filepath']) ?? '';
          const isStrictPlanPath = filePath.includes('.claude/plans/') && filePath.endsWith('.md');
          const isBroadPlanPath = hasExitPlanMode && filePath.endsWith('.md');
          if (isStrictPlanPath || isBroadPlanPath) {
            planContent = findStringByKeys(candidate.event.toolInput, ['content', 'text']) ?? '';
            planFilePath = filePath;
            planToolIdx = j;
            break;
          }
        }
      }
    }

    if (planToolIdx < 0) continue;

    // Fallback to lastAssistantMessage if content extraction failed
    if (!planContent && n.event.lastAssistantMessage) {
      planContent = n.event.lastAssistantMessage;
    }

    // Replace the Stop node with a plan-review node
    const planNode: SessionRenderNode = {
      kind: 'plan-review',
      id: `plan-review-${n.event.id}`,
      planContent,
      planFilePath,
      event: n.event,
    };
    nodes.splice(i, 1, planNode);

    // Remove the Write/Edit .md node
    nodes.splice(planToolIdx, 1);
  }

  // Check if there's a PostToolUse event for AskUserQuestion (the primary source).
  // When both PostToolUse and Stop events exist for the same AskUserQuestion call,
  // remove the Stop event to avoid duplicate ask-user-question nodes.
  const hasPostToolUseAsk = nodes.some(n =>
    n.kind === 'event' &&
    n.event.hookEventName === 'PostToolUse' &&
    normalizeToolName(n.event.toolName) === 'askuserquestion',
  );

  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.kind !== 'event' || n.event.hookEventName !== 'Stop') continue;
    if (n.event.toolName !== 'AskUserQuestion') continue;

    const toolInput = n.event.toolInput as Record<string, unknown> | null;
    const questions = toolInput?.questions as Question[] | undefined;
    if (!questions || !Array.isArray(questions) || questions.length === 0) continue;

    if (hasPostToolUseAsk) {
      // PostToolUse will be converted to ask-user-question below; remove the
      // redundant Stop event so we don't render the question twice.
      nodes.splice(i, 1);
    } else {
      // Fallback: no PostToolUse exists, convert the Stop event directly.
      const askNode: SessionRenderNode = {
        kind: 'ask-user-question',
        id: `ask-question-${n.event.id}`,
        questions,
        event: n.event,
      };
      nodes.splice(i, 1, askNode);
    }
  }

  // Detect PostToolUse events with AskUserQuestion tool
  // (when stdin='ignore', AskUserQuestion fires as PostToolUse, not Stop)
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.kind !== 'event' || n.event.hookEventName !== 'PostToolUse') continue;
    if (normalizeToolName(n.event.toolName) !== 'askuserquestion') continue;

    const toolInput = n.event.toolInput as Record<string, unknown> | null;
    const questions = toolInput?.questions as Question[] | undefined;
    if (!questions || !Array.isArray(questions) || questions.length === 0) continue;

    const askNode: SessionRenderNode = {
      kind: 'ask-user-question',
      id: `ask-question-${n.event.id}`,
      questions,
      event: n.event,
    };
    nodes.splice(i, 1, askNode);
  }

  // Collapse completed turns: UserPromptSubmit → middle nodes → Stop
  // Wrap middle nodes into a CollapsedTurnGroupNode so the UI can show them as an accordion.
  // In-progress turns (no Stop yet) remain ungrouped.
  const collapsed: SessionRenderNode[] = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i];
    const isUserPrompt =
      node.kind === 'event' && node.event.hookEventName === 'UserPromptSubmit';

    if (!isUserPrompt) {
      collapsed.push(node);
      i++;
      continue;
    }

    // Found a UserPromptSubmit — scan ahead for the matching Stop
    let stopIdx = -1;
    for (let j = i + 1; j < nodes.length; j++) {
      const candidate = nodes[j];
      // Hit another UserPromptSubmit or session divider — this turn has no Stop
      if (
        candidate.kind === 'session-divider' ||
        (candidate.kind === 'event' && candidate.event.hookEventName === 'UserPromptSubmit')
      ) {
        break;
      }
      if (candidate.kind === 'event' && candidate.event.hookEventName === 'Stop') {
        stopIdx = j;
        break;
      }
    }

    if (stopIdx < 0) {
      // No Stop found — turn is in-progress, emit nodes as-is
      collapsed.push(node);
      i++;
      continue;
    }

    // Collect middle nodes (between UserPromptSubmit and Stop)
    const middleNodes = nodes.slice(i + 1, stopIdx);

    // Push the UserPromptSubmit
    collapsed.push(node);

    if (middleNodes.length > 0) {
      const group: CollapsedTurnGroupNode = {
        kind: 'collapsed-turn',
        id: `collapsed-turn-${(node as { event: ServerEvent }).event.id}`,
        stepCount: middleNodes.length,
        innerNodes: middleNodes,
      };
      collapsed.push(group);
    }

    // Push the Stop node
    collapsed.push(nodes[stopIdx]);
    i = stopIdx + 1;
  }

  return collapsed;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem > 0 ? `${m} min ${rem}s` : `${m} min`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h} hr ${remM} min` : `${h} hr`;
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
      findStringByKeys(event.toolInput, ['old_string', 'oldText', 'before', 'original'], 5, true) ??
      findStringByKeys(event.toolResponse, ['old_string', 'oldText', 'before', 'original'], 5, true);

    const after =
      findStringByKeys(event.toolInput, ['new_string', 'newText', 'after', 'replacement'], 5, true) ??
      findStringByKeys(event.toolResponse, ['new_string', 'newText', 'after', 'replacement'], 5, true);

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

export function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
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
