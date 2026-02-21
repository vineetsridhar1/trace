import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const SERVER_URL = 'http://localhost:3100';
const THREAD_NEAR_BOTTOM_THRESHOLD_PX = 72;
const READ_LIKE_TOOL_NAMES = new Set(['read', 'glob']);
const EDIT_LIKE_TOOL_NAMES = new Set(['edit', 'multiedit', 'write']);

interface TraceAPI {
  spawnClaude: (
    messageId: string,
    prompt: string,
  ) => Promise<{ success: boolean; worktreePath?: string; error?: string }>;
  deleteWorktree: (
    messageId: string,
  ) => Promise<{ success: boolean; removed?: boolean; worktreePath?: string; error?: string }>;
  reportClaudeActivity: (
    messageId: string,
    eventType: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    traceAPI: TraceAPI;
  }
}

interface ServerEvent {
  id: string;
  sessionId: string;
  hookEventName: string;
  timestamp: string;
  toolName: string | null;
  toolInput: unknown;
  toolResponse: unknown;
  toolUseId: string | null;
  stopHookActive: boolean | null;
  lastAssistantMessage: string | null;
  rawPayload: unknown;
  threadId: string;
  importance: string;
}

interface Channel {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface MessageSession {
  sessionId: string;
  cwd: string | null;
  status: string;
}

interface ChannelMessage {
  id: string;
  channelId: string;
  sessionId: string;
  preview: string | null;
  importance: string;
  createdAt: string;
  session: MessageSession;
  _count: { threads: number };
}

interface MessageThread {
  id: string;
  messageId: string;
  createdAt: string;
  _count: { events: number };
}

interface MessageEnvelope {
  channelId: string;
  message: ChannelMessage;
}

interface ThreadEventEnvelope {
  channelId: string;
  messageId: string;
  threadId: string;
  event: ServerEvent;
}

type ThreadStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
type DragTarget = 'left' | 'right' | null;

interface ThreadEventNode {
  kind: 'event';
  event: ServerEvent;
}

interface ReadGlobGroupNode {
  kind: 'readglob-group';
  id: string;
  count: number;
  startTimestamp: string;
  endTimestamp: string;
  summaryLabels: string[];
  events: ServerEvent[];
}

type ThreadRenderNode = ThreadEventNode | ReadGlobGroupNode;

interface ExtractedDiffContent {
  title: string;
  filePath: string | null;
  diffText: string | null;
  fallbackText: string;
}

interface ParsedHunk {
  content?: string;
  [key: string]: unknown;
}

interface ParsedDiffFile {
  type?: string;
  oldPath?: string;
  newPath?: string;
  hunks?: ParsedHunk[];
  [key: string]: unknown;
}

interface DiffComponentProps {
  viewType?: 'split' | 'unified';
  diffType?: string;
  hunks: ParsedHunk[];
  children?: (hunks: ParsedHunk[]) => ReactNode;
  [key: string]: unknown;
}

interface HunkComponentProps {
  hunk: ParsedHunk;
  [key: string]: unknown;
}

interface DiffRuntime {
  Diff: ComponentType<DiffComponentProps>;
  Hunk: ComponentType<HunkComponentProps>;
  parseDiff: (diffText: string) => ParsedDiffFile[];
}

let diffRuntimePromise: Promise<DiffRuntime | null> | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function avatarInitial(sessionId: string): string {
  return sessionId.slice(0, 2).toUpperCase();
}

function extractPromptText(rawPayload: unknown): string | null {
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

function serializeUnknown(value: unknown, maxLen = 1000): string {
  try {
    const serialized = JSON.stringify(value, null, 2) ?? '';
    return serialized.length > maxLen ? `${serialized.slice(0, maxLen)}...` : serialized;
  } catch {
    const fallback = String(value ?? '');
    return fallback.length > maxLen ? `${fallback.slice(0, maxLen)}...` : fallback;
  }
}

function normalizeToolName(toolName: string | null): string {
  return (toolName ?? '').trim().toLowerCase();
}

function toRelativeDisplayPath(pathValue: string): string {
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

function isReadLikeEvent(event: ServerEvent): boolean {
  return event.hookEventName === 'PostToolUse' && READ_LIKE_TOOL_NAMES.has(normalizeToolName(event.toolName));
}

function isEditLikeEvent(event: ServerEvent): boolean {
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

function findStringByKeys(
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

function extractReadGlobSummary(event: ServerEvent): string {
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

function buildThreadNodes(events: ServerEvent[]): ThreadRenderNode[] {
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

function extractEditDiffContent(event: ServerEvent): ExtractedDiffContent {
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

async function loadDiffRuntime(): Promise<DiffRuntime | null> {
  if (!diffRuntimePromise) {
    diffRuntimePromise = (async () => {
      try {
        // eslint-disable-next-line import/no-unresolved
        const module = await import('react-diff-view');
        // eslint-disable-next-line import/no-unresolved
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

function EditDiffPreview({ event }: { event: ServerEvent }) {
  const [runtime, setRuntime] = useState<DiffRuntime | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadDiffRuntime().then((loadedRuntime) => {
      if (!cancelled) {
        setRuntime(loadedRuntime);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const diffContent = useMemo(() => extractEditDiffContent(event), [event]);

  if (!diffContent.diffText) {
    return (
      <div className="edit-diff-view mt-2 space-y-2">
        <div className="edit-diff-meta text-[11px] font-semibold text-[#a9b1d6]">{diffContent.title}</div>
        <pre>{diffContent.fallbackText}</pre>
      </div>
    );
  }

  if (!runtime) {
    return (
      <div className="edit-diff-view mt-2 space-y-2">
        <div className="edit-diff-meta text-[11px] font-semibold text-[#a9b1d6]">{diffContent.title}</div>
        <pre>{diffContent.diffText.slice(0, 3000)}</pre>
      </div>
    );
  }

  let files: ParsedDiffFile[] = [];
  try {
    files = runtime.parseDiff(diffContent.diffText);
  } catch {
    return (
      <div className="edit-diff-view mt-2 space-y-2">
        <div className="edit-diff-meta text-[11px] font-semibold text-[#a9b1d6]">{diffContent.title}</div>
        <pre>{diffContent.fallbackText}</pre>
      </div>
    );
  }

  if (!Array.isArray(files) || files.length === 0) {
    return (
      <div className="edit-diff-view mt-2 space-y-2">
        <div className="edit-diff-meta text-[11px] font-semibold text-[#a9b1d6]">{diffContent.title}</div>
        <pre>{diffContent.fallbackText}</pre>
      </div>
    );
  }

  const DiffComponent = runtime.Diff;
  const HunkComponent = runtime.Hunk;

  return (
    <div className="edit-diff-view mt-2 space-y-2">
      <div className="edit-diff-meta text-[11px] font-semibold text-[#a9b1d6]">{diffContent.title}</div>
      {files.slice(0, 5).map((file, fileIndex) => {
        const hunks = Array.isArray(file?.hunks) ? file.hunks : [];
        if (hunks.length === 0) {
          return null;
        }

        const displayPath =
          (typeof file?.newPath === 'string' && file.newPath) ||
          (typeof file?.oldPath === 'string' && file.oldPath) ||
          diffContent.filePath ||
          'file.txt';

        return (
          <div key={`${displayPath}-${fileIndex}`} className="edit-diff-file overflow-hidden rounded-md border border-[#3b3f5c]">
            <div className="edit-diff-file-header border-b border-[#3b3f5c] bg-[#1a1b26] px-2 py-1 text-[11px] font-semibold text-[#a9b1d6]">
              {displayPath}
            </div>
            <div className="edit-diff-body bg-[#16161e]">
              <DiffComponent
                viewType="unified"
                diffType={file?.type ?? 'modify'}
                hunks={hunks}
              >
                {(renderedHunks: ParsedHunk[]) =>
                  renderedHunks.map((hunk, hunkIndex) => (
                    <HunkComponent key={`${displayPath}-${hunk?.content ?? hunkIndex}`} hunk={hunk} />
                  ))
                }
              </DiffComponent>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ChannelMessage | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [threadEvents, setThreadEvents] = useState<ServerEvent[]>([]);
  const [threadStatus, setThreadStatus] = useState<ThreadStatus>('idle');
  const [messageInput, setMessageInput] = useState('');
  const [threadInput, setThreadInput] = useState('');
  const [sseConnected, setSseConnected] = useState(false);
  const [channelWidth, setChannelWidth] = useState(220);
  const [threadWidth, setThreadWidth] = useState(0);
  const [dragging, setDragging] = useState<DragTarget>(null);
  const [deletingWorktree, setDeletingWorktree] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [expandedReadGroupIds, setExpandedReadGroupIds] = useState<Record<string, boolean>>({});

  const feedListRef = useRef<HTMLDivElement | null>(null);
  const threadContentRef = useRef<HTMLDivElement | null>(null);
  const activeSseRef = useRef<EventSource | null>(null);
  const activeChannelRef = useRef<string | null>(null);
  const selectedMessageRef = useRef<ChannelMessage | null>(null);
  const selectedMessageIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChannelMessage[]>([]);
  const threadNearBottomRef = useRef(true);
  const prevThreadEventCountRef = useRef(0);
  const lastReportedThreadEventIdByMessageRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    activeChannelRef.current = activeChannelId;
  }, [activeChannelId]);

  useEffect(() => {
    selectedMessageRef.current = selectedMessage;
  }, [selectedMessage]);

  useEffect(() => {
    selectedMessageIdRef.current = selectedMessageId;
  }, [selectedMessageId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId) ?? null,
    [channels, activeChannelId],
  );

  const feedTitle = activeChannel ? `# ${activeChannel.name}` : 'Activity Feed';
  const threadOpen = threadWidth > 0;

  const threadNodes = useMemo(() => buildThreadNodes(threadEvents), [threadEvents]);

  const reportClaudeActivity = useCallback(async (messageId: string, eventType: string) => {
    if (!window.traceAPI || typeof window.traceAPI.reportClaudeActivity !== 'function') {
      return;
    }

    try {
      await window.traceAPI.reportClaudeActivity(messageId, eventType);
    } catch {
      // Ignore activity reporting failures, this is best-effort.
    }
  }, []);

  const isThreadNearBottom = useCallback((): boolean => {
    const el = threadContentRef.current;
    if (!el) {
      return true;
    }

    return el.scrollHeight - el.scrollTop - el.clientHeight < THREAD_NEAR_BOTTOM_THRESHOLD_PX;
  }, []);

  const scrollFeedToBottom = useCallback(() => {
    const el = feedListRef.current;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, []);

  const scrollThreadToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = threadContentRef.current;
    if (!el) {
      return;
    }

    el.scrollTo({ top: el.scrollHeight, behavior });
    threadNearBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  useEffect(() => {
    scrollFeedToBottom();
  }, [messages, scrollFeedToBottom]);

  useEffect(() => {
    const previousEventCount = prevThreadEventCountRef.current;
    const nextEventCount = threadEvents.length;
    const hasNewEvents = nextEventCount > previousEventCount;

    prevThreadEventCountRef.current = nextEventCount;

    if (!hasNewEvents) {
      return;
    }

    if (threadNearBottomRef.current || previousEventCount === 0) {
      requestAnimationFrame(() => {
        scrollThreadToBottom('auto');
      });
      return;
    }

    setShowJumpToLatest(true);
  }, [threadEvents, scrollThreadToBottom]);

  const upsertMessage = useCallback((message: ChannelMessage) => {
    setMessages((current) => {
      const existingIndex = current.findIndex((item) => item.id === message.id);
      const next = [...current];

      if (existingIndex >= 0) {
        next[existingIndex] = message;
      } else {
        next.push(message);
      }

      next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return next;
    });

    setSelectedMessage((current) => {
      if (!current || current.id !== message.id) {
        return current;
      }
      return message;
    });
  }, []);

  const resetThreadViewState = useCallback(() => {
    setShowJumpToLatest(false);
    setExpandedReadGroupIds({});
    threadNearBottomRef.current = true;
    prevThreadEventCountRef.current = 0;
  }, []);

  const closeThreadPanel = useCallback(() => {
    setSelectedMessageId(null);
    setSelectedMessage(null);
    setActiveThreadId(null);
    setThreadEvents([]);
    setThreadStatus('idle');
    setChannelWidth(220);
    setThreadWidth(0);
    resetThreadViewState();
  }, [resetThreadViewState]);

  const loadThreadEvents = useCallback(
    async (message: ChannelMessage) => {
      try {
        setThreadStatus('loading');

        const threadsRes = await fetch(
          `${SERVER_URL}/channels/${message.channelId}/messages/${message.id}/threads`,
        );
        if (!threadsRes.ok) {
          setThreadStatus('error');
          return;
        }

        const { threads } = (await threadsRes.json()) as { threads: MessageThread[] };
        if (threads.length === 0) {
          setActiveThreadId(null);
          setThreadEvents([]);
          setThreadStatus('empty');
          return;
        }

        const thread = threads[0];
        setActiveThreadId(thread.id);

        const eventsRes = await fetch(
          `${SERVER_URL}/channels/${message.channelId}/messages/${message.id}/threads/${thread.id}/events?limit=200`,
        );
        if (!eventsRes.ok) {
          setThreadStatus('error');
          return;
        }

        const { events } = (await eventsRes.json()) as { events: ServerEvent[] };
        setThreadEvents(events);
        setThreadStatus(events.length === 0 ? 'empty' : 'ready');

        const latestEvent = events[events.length - 1];
        if (latestEvent) {
          const lastReportedId = lastReportedThreadEventIdByMessageRef.current.get(message.id);
          if (lastReportedId !== latestEvent.id) {
            lastReportedThreadEventIdByMessageRef.current.set(message.id, latestEvent.id);
            void reportClaudeActivity(message.id, latestEvent.hookEventName);
          }
        }
      } catch {
        setThreadStatus('error');
      }
    },
    [reportClaudeActivity],
  );

  const refreshMessages = useCallback(async (channelId?: string) => {
    const targetChannelId = channelId ?? activeChannelRef.current;
    if (!targetChannelId) {
      return;
    }

    try {
      const res = await fetch(`${SERVER_URL}/channels/${targetChannelId}/messages?limit=200`);
      if (!res.ok) {
        return;
      }

      const { messages: fetchedMessages } = await res.json();
      const ordered = (fetchedMessages as ChannelMessage[]).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      setMessages(ordered);
    } catch {
      // Server may not be up yet.
    }
  }, []);

  const openThreadPanel = useCallback(
    (message: ChannelMessage) => {
      setSelectedMessageId(message.id);
      setSelectedMessage(message);
      setChannelWidth(0);
      setThreadWidth(clamp(Math.floor(window.innerWidth * 0.5), 280, 600));
      resetThreadViewState();
      void loadThreadEvents(message);
    },
    [loadThreadEvents, resetThreadViewState],
  );

  const switchChannel = useCallback(
    (channelId: string) => {
      setActiveChannelId(channelId);
      setMessages([]);
      closeThreadPanel();
    },
    [closeThreadPanel],
  );

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/channels`);
      if (!res.ok) {
        return;
      }

      const { channels: fetchedChannels } = await res.json();
      const typedChannels = fetchedChannels as Channel[];
      setChannels(typedChannels);

      setActiveChannelId((current) => {
        if (current) {
          return current;
        }

        if (typedChannels.length > 0) {
          return typedChannels[0].id;
        }

        return null;
      });
    } catch {
      // Server may not be up yet.
    }
  }, []);

  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    if (!activeChannelId) {
      return;
    }

    void refreshMessages(activeChannelId);
  }, [activeChannelId, refreshMessages]);

  useEffect(() => {
    if (activeSseRef.current) {
      activeSseRef.current.close();
      activeSseRef.current = null;
    }

    if (!activeChannelId) {
      return;
    }

    const source = new EventSource(`${SERVER_URL}/sse/channels/${activeChannelId}`);
    activeSseRef.current = source;
    setSseConnected(false);

    source.addEventListener('connected', () => {
      setSseConnected(true);
    });

    source.addEventListener('message-created', (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as MessageEnvelope;
      if (payload.channelId !== activeChannelRef.current) {
        return;
      }
      upsertMessage(payload.message);
    });

    source.addEventListener('message-upsert', (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as MessageEnvelope;
      if (payload.channelId !== activeChannelRef.current) {
        return;
      }
      upsertMessage(payload.message);
    });

    source.addEventListener('thread-event-created', (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as ThreadEventEnvelope;
      if (payload.channelId !== activeChannelRef.current) {
        return;
      }

      void reportClaudeActivity(payload.messageId, payload.event.hookEventName);

      if (selectedMessageIdRef.current !== payload.messageId) {
        return;
      }

      const message =
        messagesRef.current.find((item) => item.id === payload.messageId) ?? selectedMessageRef.current;
      if (message) {
        void loadThreadEvents(message);
      }
    });

    source.addEventListener('error', () => {
      setSseConnected(false);
    });

    return () => {
      source.close();
      if (activeSseRef.current === source) {
        activeSseRef.current = null;
      }
    };
  }, [activeChannelId, loadThreadEvents, reportClaudeActivity, upsertMessage]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!activeChannelRef.current || sseConnected) {
        return;
      }

      void refreshMessages(activeChannelRef.current);
      if (selectedMessageRef.current) {
        void loadThreadEvents(selectedMessageRef.current);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [loadThreadEvents, refreshMessages, sseConnected]);

  useEffect(() => {
    if (!dragging) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      if (dragging === 'left') {
        setChannelWidth(clamp(event.clientX, 160, 400));
        return;
      }

      const newWidth = clamp(window.innerWidth - event.clientX, 280, 600);
      setThreadWidth(newWidth);
    };

    const onMouseUp = () => {
      setDragging(null);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging]);

  const sendMessage = useCallback(async () => {
    const text = messageInput.trim();
    if (!text || !activeChannelRef.current) {
      return;
    }

    const channelId = activeChannelRef.current;
    setMessageInput('');

    try {
      const res = await fetch(`${SERVER_URL}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        return;
      }

      const { message } = (await res.json()) as { message: ChannelMessage };
      upsertMessage(message);
      openThreadPanel(message);

      const result = await window.traceAPI.spawnClaude(message.id, text);
      if (!result.success) {
        console.error('Failed to spawn claude for message:', result.error);
      }
    } catch {
      console.error('Failed to send message');
    }
  }, [messageInput, openThreadPanel, upsertMessage]);

  const sendThreadMessage = useCallback(async () => {
    const text = threadInput.trim();
    const channelId = activeChannelRef.current;
    const message = selectedMessageRef.current;

    if (!text || !message || !channelId) {
      return;
    }

    setThreadInput('');

    try {
      const persistRes = await fetch(
        `${SERVER_URL}/channels/${channelId}/messages/${message.id}/prompts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        },
      );

      if (!persistRes.ok) {
        console.error('Failed to persist thread prompt');
        return;
      }

      const { message: updatedMessage } = (await persistRes.json()) as { message: ChannelMessage };
      upsertMessage(updatedMessage);

      if (selectedMessageIdRef.current === updatedMessage.id) {
        void loadThreadEvents(updatedMessage);
      }

      const result = await window.traceAPI.spawnClaude(message.id, text);
      if (!result.success) {
        console.error('Failed to spawn claude:', result.error);
      }
    } catch {
      console.error('Failed to send thread message');
    }
  }, [loadThreadEvents, threadInput, upsertMessage]);

  const deleteWorktree = useCallback(async () => {
    const message = selectedMessageRef.current;
    if (!message) {
      return;
    }

    const confirmed = window.confirm('Delete this thread worktree? This removes local files for this message.');
    if (!confirmed) {
      return;
    }

    setDeletingWorktree(true);

    try {
      const result = await window.traceAPI.deleteWorktree(message.id);
      if (!result.success) {
        console.error('Failed to delete worktree:', result.error);
        return;
      }

      console.log(
        result.removed
          ? `Deleted worktree: ${result.worktreePath}`
          : `Worktree already missing: ${result.worktreePath}`,
      );
    } finally {
      setDeletingWorktree(false);
    }
  }, []);

  const renderThreadEvent = (event: ServerEvent) => {
    const time = formatTime(event.timestamp);

    if (event.hookEventName === 'UserPromptSubmit') {
      const prompt =
        extractPromptText(event.rawPayload) ?? event.lastAssistantMessage ?? '(prompt)';

      return (
        <div key={event.id} className="thread-bubble flex justify-end">
          <div className="max-w-[85%] rounded-xl rounded-br-sm border border-violet-500/40 bg-violet-500/15 px-3 py-2">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-semibold text-violet-300">You</span>
              <span className="text-xs text-[#565f89]">{time}</span>
            </div>
            <div className="break-words whitespace-pre-wrap text-sm text-[#c0caf5]">
              {prompt.slice(0, 500)}
            </div>
          </div>
        </div>
      );
    }

    if (event.hookEventName === 'PostToolUse') {
      const hasToolInput = event.toolInput !== null && event.toolInput !== undefined;
      const editLike = isEditLikeEvent(event);
      const activityLabel = editLike
        ? `${event.toolName ?? 'Edit'} applied`
        : `${event.toolName ?? 'Tool'} executed`;

      return (
        <div key={event.id} className="activity-row">
          <div className="activity-row-header">
            <span className="activity-row-icon">{editLike ? '✏️' : '🛠'}</span>
            <span className="activity-row-title">{activityLabel}</span>
            <span className="activity-row-time">{time}</span>
          </div>
          {event.lastAssistantMessage && (
            <div className="activity-row-note">{event.lastAssistantMessage.slice(0, 320)}</div>
          )}
          {editLike ? (
            <EditDiffPreview event={event} />
          ) : (
            hasToolInput && (
              <details className="activity-row-details mt-1">
                <summary>Tool input</summary>
                <pre className="mt-1">{serializeUnknown(event.toolInput)}</pre>
              </details>
            )
          )}
          {event.toolResponse && !editLike && (
            <details className="activity-row-details mt-1">
              <summary>Tool output</summary>
              <pre className="mt-1">{serializeUnknown(event.toolResponse)}</pre>
            </details>
          )}
        </div>
      );
    }

    if (event.hookEventName === 'Stop') {
      return (
        <div key={event.id} className="thread-bubble flex justify-start">
          <div className="max-w-[85%] rounded-xl rounded-bl-sm border border-[#292e42] bg-[#1f2335] px-3 py-2">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-semibold text-violet-300">Claude</span>
              <span className="ml-auto text-xs text-[#565f89]">{time}</span>
            </div>
            {event.lastAssistantMessage ? (
              <div className="break-words whitespace-pre-wrap text-sm text-[#c0caf5]">
                {event.lastAssistantMessage}
              </div>
            ) : (
              <div className="text-sm text-[#565f89]">Claude completed the run.</div>
            )}
            <div className="mt-2 text-[11px] tracking-wide text-[#565f89] uppercase">Stop hook</div>
          </div>
        </div>
      );
    }

    return (
      <div key={event.id} className="activity-row">
        <div className="activity-row-header">
          <span className="activity-row-icon">•</span>
          <span className="activity-row-title">{event.hookEventName}</span>
          <span className="activity-row-time">{time}</span>
        </div>
        <details className="activity-row-details mt-1">
          <summary>Details</summary>
          <pre className="mt-1">{serializeUnknown(event.rawPayload, 600)}</pre>
        </details>
      </div>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#1a1b26] text-[#c0caf5]">
      <div
        id="channel-panel"
        className={`flex min-w-0 flex-col border-r border-[#292e42] bg-[#16161e] ${dragging ? '' : 'panel-animate'}`}
        style={{ width: `${channelWidth}px`, overflow: channelWidth === 0 ? 'hidden' : undefined }}
      >
        <div className="border-b border-[#292e42] px-4 pt-3 pb-2">
          <h2 className="text-xs font-semibold tracking-wide text-[#565f89] uppercase">Channels</h2>
        </div>

        <div id="channel-items" className="flex-1 overflow-y-auto px-2 py-1">
          {channels.map((channel) => {
            const isActive = channel.id === activeChannelId;
            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => switchChannel(channel.id)}
                className={`channel-item my-0.5 flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                  isActive ? 'active font-semibold' : 'text-[#a9b1d6]'
                }`}
              >
                <span className="text-xs text-[#565f89]">#</span>
                {channel.name}
              </button>
            );
          })}
        </div>
      </div>

      {channelWidth > 0 && (
        <div
          className={`resize-handle ${dragging === 'left' ? 'active' : ''}`}
          onMouseDown={(event) => {
            event.preventDefault();
            setDragging('left');
          }}
        />
      )}

      <div id="messages-panel" className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#1a1b26]">
        <div className="border-b border-[#292e42] px-4 py-3">
          <h2 id="feed-title" className="text-sm font-semibold text-violet-300">
            {feedTitle}
          </h2>
        </div>

        <div
          id="feed-list"
          ref={feedListRef}
          className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto px-2 py-2"
        >
          {messages.map((message) => {
            const isSelected = message.id === selectedMessageId;
            const active = message.session.status !== 'stopped';
            const preview = message.preview || message.session.cwd || message.sessionId;
            const threadCount = message._count.threads;

            return (
              <button
                key={message.id}
                type="button"
                className={`message-item flex cursor-pointer items-start gap-3 border-l-2 border-transparent px-3 py-3 text-left transition-colors ${
                  isSelected ? 'selected' : ''
                }`}
                onClick={() => openThreadPanel(message)}
              >
                <div
                  className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    active ? 'bg-violet-500 text-white' : 'bg-[#1f2335] text-[#565f89]'
                  }`}
                >
                  {avatarInitial(message.sessionId)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#c0caf5]">Session</span>
                    <span className="rounded bg-[#1f2335] px-1.5 py-0.5 font-mono text-xs text-[#565f89]">
                      {message.sessionId.slice(0, 8)}
                    </span>
                    <span className="ml-auto text-xs text-[#565f89]">{formatTime(message.createdAt)}</span>
                  </div>

                  <div className="mt-1 truncate text-sm text-[#a9b1d6]">{preview}</div>

                  {threadCount > 0 && (
                    <div className="mt-1.5 text-xs text-violet-300 hover:underline">
                      {threadCount} thread{threadCount > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-[#292e42] px-3 py-3">
          <div className="flex items-center gap-2">
            <input
              id="message-input"
              type="text"
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Send a message..."
              className="flex-1 rounded-lg border border-[#292e42] bg-[#1f2335] px-3 py-2 text-sm text-[#c0caf5] outline-none transition-colors placeholder:text-[#565f89] focus:border-violet-500"
            />
            <button
              id="message-send"
              type="button"
              onClick={() => {
                void sendMessage();
              }}
              className="cursor-pointer rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {threadOpen && (
        <div
          className={`resize-handle ${dragging === 'right' ? 'active' : ''}`}
          onMouseDown={(event) => {
            event.preventDefault();
            setDragging('right');
          }}
        />
      )}

      <div
        id="thread-panel"
        className={`flex min-h-0 flex-col overflow-hidden border-l border-[#292e42] bg-[#16161e] ${dragging ? '' : 'panel-animate'}`}
        style={{ width: `${threadWidth}px` }}
      >
        <div id="thread-header" className="flex items-center justify-between border-b border-[#292e42] px-4 py-3">
          <h3 className="text-sm font-semibold text-violet-300">Thread</h3>
          <div className="flex items-center gap-2">
            <button
              id="thread-delete-worktree"
              type="button"
              title="Delete worktree for this thread"
              disabled={!selectedMessageId || deletingWorktree}
              onClick={() => {
                void deleteWorktree();
              }}
              className="h-7 w-7 cursor-pointer rounded-md border border-[#292e42] text-xs text-[#565f89] transition-colors hover:border-red-400/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg
                viewBox="0 0 24 24"
                className="mx-auto h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M6 6l1 14h10l1-14" />
                <path d="M10 10v7" />
                <path d="M14 10v7" />
              </svg>
            </button>
            <button
              id="thread-close"
              type="button"
              onClick={closeThreadPanel}
              className="cursor-pointer text-xl leading-none text-[#565f89] hover:text-[#c0caf5]"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="thread-panel-shell relative flex min-h-0 flex-1">
          <div
            id="thread-content"
            ref={threadContentRef}
            onScroll={() => {
              const nearBottom = isThreadNearBottom();
              threadNearBottomRef.current = nearBottom;
              if (nearBottom) {
                setShowJumpToLatest(false);
              }
            }}
            className="thread-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3"
          >
            <div className="thread-events-list">
              {threadStatus === 'loading' && <div className="text-sm text-[#565f89]">Loading events...</div>}
              {threadStatus === 'empty' && (
                <div className="text-sm text-[#565f89]">
                  {activeThreadId ? 'No events yet' : 'No threads yet. Send a message to start.'}
                </div>
              )}
              {threadStatus === 'error' && <div className="text-sm text-red-400">Failed to load events</div>}

              {threadNodes.map((node) => {
                if (node.kind === 'readglob-group') {
                  const isExpanded = Boolean(expandedReadGroupIds[node.id]);

                  return (
                    <div key={node.id} className="activity-row activity-row-compact">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedReadGroupIds((current) => ({
                            ...current,
                            [node.id]: !current[node.id],
                          }));
                        }}
                        className="activity-row-header w-full cursor-pointer text-left"
                      >
                        <span className="activity-row-icon">📚</span>
                        <span className="activity-row-title">{node.count} file scans (Read/Glob)</span>
                        <span className="activity-row-time">
                          {formatTime(node.startTimestamp)} - {formatTime(node.endTimestamp)}
                        </span>
                        <span className={`read-group-chevron text-[10px] text-[#7f8bbf] ${isExpanded ? 'open' : ''}`}>
                          ▼
                        </span>
                      </button>

                      {node.summaryLabels.length > 0 && (
                        <div className="activity-row-note">{node.summaryLabels.join(' · ')}</div>
                      )}

                      <div className={`read-group-body ${isExpanded ? 'open' : ''}`}>
                        <div className="space-y-1 pt-1">
                          {node.events.map((eventItem) => (
                            <div key={eventItem.id} className="activity-row-subline">
                              <span className="font-semibold text-[#8f9bcf]">{eventItem.toolName ?? 'Read/Glob'}</span>
                              <span className="mx-2 text-[#59689d]">·</span>
                              <span className="text-[#7a87bb]">{extractReadGlobSummary(eventItem)}</span>
                              <span className="ml-auto text-[#5e6b9f]">{formatTime(eventItem.timestamp)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                }

                return renderThreadEvent(node.event);
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              scrollThreadToBottom('smooth');
            }}
            className={`jump-latest-chip ${showJumpToLatest ? 'visible' : ''}`}
          >
            Jump to latest
          </button>
        </div>

        <div className="border-t border-[#292e42] px-3 py-3">
          <div className="flex items-center gap-2">
            <input
              id="thread-input"
              type="text"
              value={threadInput}
              onChange={(event) => setThreadInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendThreadMessage();
                }
              }}
              placeholder="Send to Claude..."
              className="flex-1 rounded-lg border border-[#292e42] bg-[#1a1b26] px-3 py-2 text-sm text-[#c0caf5] outline-none transition-colors placeholder:text-[#565f89] focus:border-violet-500"
            />
            <button
              id="thread-send"
              type="button"
              onClick={() => {
                void sendThreadMessage();
              }}
              className="cursor-pointer rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
