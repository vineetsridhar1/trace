import './index.css';

const SERVER_URL = 'http://localhost:3100';

interface TraceAPI {
  spawnClaude: (messageId: string, prompt: string) => Promise<{ success: boolean; worktreePath?: string; error?: string }>;
  deleteWorktree: (messageId: string) => Promise<{ success: boolean; removed?: boolean; worktreePath?: string; error?: string }>;
}

declare global {
  interface Window {
    traceAPI: TraceAPI;
  }
}

// Types matching the server's models
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

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  activeChannelId: null as string | null,
  selectedMessageId: null as string | null,
  selectedMessage: null as ChannelMessage | null,
  activeThreadId: null as string | null,
  channels: [] as Channel[],
  messages: [] as ChannelMessage[],
};

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const channelItems = document.getElementById('channel-items')!;
const feedList = document.getElementById('feed-list')!;
const feedTitle = document.getElementById('feed-title')!;
const threadPanel = document.getElementById('thread-panel')!;
const threadContent = document.getElementById('thread-content')!;
const threadClose = document.getElementById('thread-close')!;
const threadDeleteWorktree = document.getElementById('thread-delete-worktree') as HTMLButtonElement;
const resizeLeft = document.getElementById('resize-left')!;
const resizeRight = document.getElementById('resize-right')!;
const channelPanel = document.getElementById('channel-panel')!;
const threadInput = document.getElementById('thread-input') as HTMLInputElement;
const threadSend = document.getElementById('thread-send')!;

// ---------------------------------------------------------------------------
// Resizable Panels
// ---------------------------------------------------------------------------
function setupResizablePanel() {
  let dragging = false;

  resizeLeft.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    resizeLeft.classList.add('active');
    channelPanel.classList.remove('panel-animate');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const newWidth = Math.min(400, Math.max(160, e.clientX));
    channelPanel.style.width = `${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    resizeLeft.classList.remove('active');
    channelPanel.classList.add('panel-animate');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

function setupRightResizablePanel() {
  let dragging = false;

  resizeRight.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    resizeRight.classList.add('active');
    threadPanel.classList.remove('panel-animate');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const windowWidth = window.innerWidth;
    const newWidth = Math.min(600, Math.max(280, windowWidth - e.clientX));
    threadPanel.style.width = `${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    resizeRight.classList.remove('active');
    threadPanel.classList.add('panel-animate');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

setupResizablePanel();
setupRightResizablePanel();
threadDeleteWorktree.disabled = true;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function avatarInitial(sessionId: string): string {
  return sessionId.slice(0, 2).toUpperCase();
}

function scrollToBottom(el: HTMLElement) {
  el.scrollTop = el.scrollHeight;
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

function upsertMessage(message: ChannelMessage) {
  const existingIndex = state.messages.findIndex((m) => m.id === message.id);
  if (existingIndex >= 0) {
    state.messages[existingIndex] = message;
  } else {
    state.messages.push(message);
  }

  state.messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (state.selectedMessageId === message.id) {
    state.selectedMessage = message;
  }
}

function rerenderFeed() {
  feedList.innerHTML = '';
  for (const message of state.messages) {
    const el = renderMessage(message);
    feedList.appendChild(el);
  }
  scrollToBottom(feedList);
}

// ---------------------------------------------------------------------------
// Channel Sidebar
// ---------------------------------------------------------------------------
async function fetchChannels() {
  try {
    const res = await fetch(`${SERVER_URL}/channels`);
    if (!res.ok) return;
    const { channels } = await res.json();
    state.channels = channels;
    renderChannelList();

    if (!state.activeChannelId && state.channels.length > 0) {
      switchChannel(state.channels[0].id);
    }
  } catch {
    // Server might not be up yet
  }
}

function renderChannelList() {
  channelItems.innerHTML = '';
  for (const channel of state.channels) {
    const el = document.createElement('div');
    const isActive = channel.id === state.activeChannelId;
    el.className = `channel-item flex items-center gap-2 px-3 py-1.5 mx-1 my-0.5 rounded-md cursor-pointer text-sm transition-colors ${isActive ? 'active font-semibold' : 'text-text-muted'}`;
    el.innerHTML = `<span class="text-muted text-xs">#</span> ${escapeHtml(channel.name)}`;
    el.addEventListener('click', () => switchChannel(channel.id));
    channelItems.appendChild(el);
  }
}

function switchChannel(channelId: string) {
  state.activeChannelId = channelId;
  const channel = state.channels.find((c) => c.id === channelId);
  feedTitle.textContent = channel ? `# ${channel.name}` : 'Activity Feed';
  renderChannelList();
  state.messages = [];
  feedList.innerHTML = '';
  closeThreadPanel();
  refreshMessages();
  reconnectSSE();
}

// ---------------------------------------------------------------------------
// Messages Feed – chat-style blocks
// ---------------------------------------------------------------------------
function renderMessage(message: ChannelMessage): HTMLElement {
  const el = document.createElement('div');
  el.className = 'message-item flex items-start gap-3 px-3 py-3 cursor-pointer border-l-2 border-transparent transition-colors';
  el.dataset.messageId = message.id;

  if (message.id === state.selectedMessageId) {
    el.classList.add('selected');
  }

  const isActive = message.session.status !== 'stopped';
  const avatarBg = isActive ? 'bg-accent' : 'bg-surface-light';
  const avatarText = isActive ? 'text-white' : 'text-muted';
  const time = formatTime(message.createdAt);
  const preview = message.preview || message.session.cwd || message.sessionId;
  const threadCount = message._count.threads;

  el.innerHTML = `
    <div class="flex-shrink-0 w-9 h-9 rounded-full ${avatarBg} ${avatarText} flex items-center justify-center text-xs font-bold mt-0.5">
      ${avatarInitial(message.sessionId)}
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="font-semibold text-sm text-text">Session</span>
        <span class="text-xs font-mono px-1.5 py-0.5 rounded bg-surface-light text-muted">${message.sessionId.slice(0, 8)}</span>
        <span class="text-xs text-text-dim ml-auto">${time}</span>
      </div>
      <div class="text-sm text-text-muted mt-1 truncate">${escapeHtml(preview)}</div>
      ${threadCount > 0 ? `<div class="text-xs text-accent-light mt-1.5 hover:underline">${threadCount} thread${threadCount > 1 ? 's' : ''}</div>` : ''}
    </div>
  `;

  el.addEventListener('click', () => {
    openThreadPanel(message);
    feedList.querySelectorAll('.message-item.selected').forEach((item) => item.classList.remove('selected'));
    el.classList.add('selected');
  });

  return el;
}

async function refreshMessages() {
  if (!state.activeChannelId) return;

  try {
    const res = await fetch(`${SERVER_URL}/channels/${state.activeChannelId}/messages?limit=200`);
    if (!res.ok) return;
    const { messages } = await res.json();

    state.messages = (messages as ChannelMessage[]).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    feedList.innerHTML = '';
    for (const message of state.messages) {
      const el = renderMessage(message);
      feedList.appendChild(el);
    }
    scrollToBottom(feedList);
  } catch {
    // Server might not be up yet
  }
}

// ---------------------------------------------------------------------------
// Thread Panel – conversation view
// ---------------------------------------------------------------------------
function openThreadPanel(message: ChannelMessage) {
  state.selectedMessageId = message.id;
  state.selectedMessage = message;
  threadDeleteWorktree.disabled = false;

  // Collapse channel sidebar + expand thread to 50%
  channelPanel.style.width = '0px';
  channelPanel.style.overflow = 'hidden';
  resizeLeft.style.display = 'none';
  threadPanel.style.width = '50vw';
  resizeRight.style.display = '';

  threadContent.innerHTML = '<div class="text-text-dim text-sm">Loading events...</div>';
  loadThreadEvents(message);
}

function closeThreadPanel() {
  state.selectedMessageId = null;
  state.selectedMessage = null;
  state.activeThreadId = null;
  threadDeleteWorktree.disabled = true;

  // Restore channel sidebar + collapse thread
  channelPanel.style.width = '220px';
  channelPanel.style.overflow = '';
  resizeLeft.style.display = '';
  threadPanel.style.width = '0px';
  resizeRight.style.display = 'none';

  feedList.querySelectorAll('.message-item.selected').forEach((item) => item.classList.remove('selected'));
}

threadClose.addEventListener('click', closeThreadPanel);
threadDeleteWorktree.addEventListener('click', async () => {
  if (!state.selectedMessage) return;

  const confirmed = window.confirm('Delete this thread worktree? This removes local files for this message.');
  if (!confirmed) return;

  const currentMessageId = state.selectedMessage.id;
  threadDeleteWorktree.disabled = true;

  try {
    const result = await window.traceAPI.deleteWorktree(currentMessageId);
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
    threadDeleteWorktree.disabled = state.selectedMessageId === null;
  }
});

async function loadThreadEvents(message: ChannelMessage) {
  try {
    const threadsRes = await fetch(
      `${SERVER_URL}/channels/${message.channelId}/messages/${message.id}/threads`,
    );
    if (!threadsRes.ok) return;
    const { threads } = (await threadsRes.json()) as { threads: MessageThread[] };

    if (threads.length === 0) {
      state.activeThreadId = null;
      threadContent.innerHTML = '<div class="text-text-dim text-sm">No threads yet. Send a message to start.</div>';
      return;
    }

    const thread = threads[0];
    state.activeThreadId = thread.id;
    const eventsRes = await fetch(
      `${SERVER_URL}/channels/${message.channelId}/messages/${message.id}/threads/${thread.id}/events?limit=200`,
    );
    if (!eventsRes.ok) return;
    const { events } = (await eventsRes.json()) as { events: ServerEvent[] };

    renderThreadEvents(events);
  } catch {
    threadContent.innerHTML = '<div class="text-red-400 text-sm">Failed to load events</div>';
  }
}

function renderThreadEvents(events: ServerEvent[]) {
  threadContent.innerHTML = '';

  if (events.length === 0) {
    threadContent.innerHTML = '<div class="text-text-dim text-sm">No events yet</div>';
    return;
  }

  for (const event of events) {
    const el = document.createElement('div');
    el.className = 'thread-bubble';

    const time = formatTime(event.timestamp);

    if (event.hookEventName === 'UserPromptSubmit') {
      // Right-aligned user bubble
      el.className += ' flex justify-end';
      const msg = extractPromptText(event.rawPayload) || event.lastAssistantMessage || '(prompt)';
      el.innerHTML = `
        <div class="max-w-[85%] bg-accent/20 border border-accent/30 rounded-xl rounded-br-sm px-3 py-2">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-semibold text-accent-light">You</span>
            <span class="text-xs text-text-dim">${time}</span>
          </div>
          <div class="text-sm text-text whitespace-pre-wrap break-words">${escapeHtml(msg.slice(0, 500))}</div>
        </div>
      `;
    } else if (event.hookEventName === 'PostToolUse') {
      // Left-aligned Claude bubble with tool info
      el.className += ' flex justify-start';
      const toolBadge = event.toolName
        ? `<span class="text-xs font-mono px-1.5 py-0.5 rounded bg-green-900/40 text-green-400">${escapeHtml(event.toolName)}</span>`
        : '';

      let detailHtml = '';
      if (event.toolInput) {
        const inputStr = JSON.stringify(event.toolInput, null, 2);
        detailHtml = `
          <details class="mt-1">
            <summary>Tool input</summary>
            <pre class="mt-1">${escapeHtml(inputStr.slice(0, 1000))}</pre>
          </details>
        `;
      }

      let assistantMsg = '';
      if (event.lastAssistantMessage) {
        assistantMsg = `<div class="text-sm text-text-muted mt-1 whitespace-pre-wrap break-words">${escapeHtml(event.lastAssistantMessage.slice(0, 500))}</div>`;
      }

      el.innerHTML = `
        <div class="max-w-[85%] bg-surface-light border border-border rounded-xl rounded-bl-sm px-3 py-2">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-semibold text-purple-400">Claude</span>
            ${toolBadge}
            <span class="text-xs text-text-dim ml-auto">${time}</span>
          </div>
          ${assistantMsg}
          ${detailHtml}
        </div>
      `;
    } else if (event.hookEventName === 'Stop') {
      // Assistant output + completion pill
      el.className += ' flex justify-start';
      const assistantText = event.lastAssistantMessage
        ? `<div class="text-sm text-text whitespace-pre-wrap break-words">${escapeHtml(
            event.lastAssistantMessage,
          )}</div>`
        : '<div class="text-sm text-text-dim">Claude completed the run.</div>';
      el.innerHTML = `
        <div class="max-w-[85%] bg-surface-light border border-border rounded-xl rounded-bl-sm px-3 py-2">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-semibold text-purple-400">Claude</span>
            <span class="text-xs text-text-dim ml-auto">${time}</span>
          </div>
          ${assistantText}
          <div class="mt-2 text-[11px] text-text-dim uppercase tracking-wide">Stop hook</div>
        </div>
      `;
    } else {
      // Generic event
      el.className += ' flex justify-start';
      el.innerHTML = `
        <div class="max-w-[85%] bg-surface-light border border-border rounded-xl px-3 py-2">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-semibold text-text-muted">${escapeHtml(event.hookEventName)}</span>
            <span class="text-xs text-text-dim ml-auto">${time}</span>
          </div>
          <div class="text-sm text-text-muted">${escapeHtml(JSON.stringify(event.rawPayload).slice(0, 300))}</div>
        </div>
      `;
    }

    threadContent.appendChild(el);
  }

  // Auto-scroll to bottom
  threadContent.scrollTop = threadContent.scrollHeight;
}

// ---------------------------------------------------------------------------
// SSE — real-time updates per channel
// ---------------------------------------------------------------------------
let activeSSE: EventSource | null = null;
let sseConnected = false;

function reconnectSSE() {
  if (activeSSE) {
    activeSSE.close();
    activeSSE = null;
  }
  if (!state.activeChannelId) return;

  const source = new EventSource(`${SERVER_URL}/sse/channels/${state.activeChannelId}`);
  sseConnected = false;

  source.addEventListener('connected', () => {
    sseConnected = true;
  });

  source.addEventListener('message-created', (evt) => {
    const payload = JSON.parse((evt as MessageEvent).data) as MessageEnvelope;
    if (payload.channelId !== state.activeChannelId) return;
    upsertMessage(payload.message);
    rerenderFeed();
  });

  source.addEventListener('message-upsert', (evt) => {
    const payload = JSON.parse((evt as MessageEvent).data) as MessageEnvelope;
    if (payload.channelId !== state.activeChannelId) return;
    upsertMessage(payload.message);
    rerenderFeed();
  });

  source.addEventListener('thread-event-created', (evt) => {
    const payload = JSON.parse((evt as MessageEvent).data) as ThreadEventEnvelope;
    if (payload.channelId !== state.activeChannelId) return;

    if (state.selectedMessageId && state.selectedMessageId === payload.messageId) {
      const message =
        state.messages.find((m) => m.id === payload.messageId) ?? state.selectedMessage;
      if (message) {
        loadThreadEvents(message);
      }
    }
  });

  source.addEventListener('error', () => {
    // EventSource auto-reconnects
    sseConnected = false;
  });

  activeSSE = source;
}

// ---------------------------------------------------------------------------
// Message Input
// ---------------------------------------------------------------------------
const messageInput = document.getElementById('message-input') as HTMLInputElement;
const messageSend = document.getElementById('message-send')!;

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !state.activeChannelId) return;

  messageInput.value = '';

  try {
    const res = await fetch(`${SERVER_URL}/channels/${state.activeChannelId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (res.ok) {
      const { message } = (await res.json()) as { message: ChannelMessage };
      upsertMessage(message);
      rerenderFeed();
      openThreadPanel(message);

      // Spawn Claude in a worktree with this message as context
      const result = await window.traceAPI.spawnClaude(message.id, text);
      if (!result.success) {
        console.error('Failed to spawn claude for message:', result.error);
      }
    }
  } catch {
    console.error('Failed to send message');
  }
}

messageSend.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ---------------------------------------------------------------------------
// Thread Input — send prompt to Claude Code
// ---------------------------------------------------------------------------
async function sendThreadMessage() {
  const text = threadInput.value.trim();
  if (!text || !state.selectedMessage || !state.activeChannelId) return;
  const activeChannelId = state.activeChannelId;
  const selectedMessage = state.selectedMessage;

  threadInput.value = '';

  try {
    const persistRes = await fetch(
      `${SERVER_URL}/channels/${activeChannelId}/messages/${selectedMessage.id}/prompts`,
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

    const { message } = (await persistRes.json()) as { message: ChannelMessage };
    upsertMessage(message);
    rerenderFeed();

    if (state.selectedMessageId === message.id) {
      loadThreadEvents(message);
    }

    const result = await window.traceAPI.spawnClaude(selectedMessage.id, text);
    if (!result.success) {
      console.error('Failed to spawn claude:', result.error);
    }
  } catch {
    console.error('Failed to send thread message');
  }
}

threadSend.addEventListener('click', sendThreadMessage);
threadInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendThreadMessage();
  }
});

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------
fetchChannels();

// Safety net: if SSE is disconnected, poll to keep feed/thread updated.
setInterval(() => {
  if (!state.activeChannelId || sseConnected) return;
  refreshMessages();
  if (state.selectedMessage) {
    loadThreadEvents(state.selectedMessage);
  }
}, 3000);
