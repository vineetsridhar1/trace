import './index.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const SERVER_URL = 'http://localhost:3100';

// Types matching the server's Event model
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
}

interface TraceAPI {
  onPtyData: (cb: (data: string) => void) => () => void;
  onPtyExit: (cb: (code: number) => void) => () => void;
  sendPtyInput: (data: string) => void;
  resizePty: (cols: number, rows: number) => void;
}

declare global {
  interface Window {
    traceAPI: TraceAPI;
  }
}

// ---------------------------------------------------------------------------
// Terminal setup
// ---------------------------------------------------------------------------
const terminalContainer = document.getElementById('terminal-container');
if (!terminalContainer) throw new Error('Missing #terminal-container element');

const term = new Terminal({
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: 13,
  theme: {
    background: '#1a1b26',
    foreground: '#c0caf5',
    cursor: '#c0caf5',
    selectionBackground: '#33467c',
  },
  cursorBlink: true,
  allowProposedApi: true,
});

const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(terminalContainer);
fitAddon.fit();

// Wire PTY <-> xterm
window.traceAPI.onPtyData((data) => term.write(data));
term.onData((data) => window.traceAPI.sendPtyInput(data));

window.traceAPI.onPtyExit((code) => {
  term.write(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`);
});

// Handle resizing
const resizeObserver = new ResizeObserver(() => {
  fitAddon.fit();
  window.traceAPI.resizePty(term.cols, term.rows);
});
resizeObserver.observe(terminalContainer);

// ---------------------------------------------------------------------------
// Activity Feed — fetches from Express server
// ---------------------------------------------------------------------------
const feedList = document.getElementById('feed-list');
if (!feedList) throw new Error('Missing #feed-list element');
const seenEventIds = new Set<string>();

function eventIcon(eventType: string): string {
  switch (eventType) {
    case 'PostToolUse':      return '🔧';
    case 'UserPromptSubmit': return '💬';
    case 'Stop':             return '🛑';
    default:                 return '📌';
  }
}

function renderEvent(event: ServerEvent): HTMLElement {
  const el = document.createElement('div');
  el.className = 'feed-item';

  const icon = eventIcon(event.hookEventName);
  const toolLabel = event.toolName ? `<span class="tool-name">${event.toolName}</span>` : '';
  const time = new Date(event.timestamp).toLocaleTimeString();

  el.innerHTML = `
    <div class="feed-item-header">
      <span class="feed-icon">${icon}</span>
      <span class="feed-event-type">${event.hookEventName}</span>
      ${toolLabel}
      <span class="feed-time">${time}</span>
    </div>
  `;

  el.addEventListener('click', () => {
    const existing = el.querySelector('.feed-detail');
    if (existing) {
      existing.remove();
      return;
    }
    const detail = document.createElement('pre');
    detail.className = 'feed-detail';
    detail.textContent = JSON.stringify(event.rawPayload, null, 2);
    el.appendChild(detail);
  });

  return el;
}

async function fetchAllEvents(): Promise<ServerEvent[]> {
  try {
    const res = await fetch(`${SERVER_URL}/sessions`);
    if (!res.ok) return [];
    const { sessions } = await res.json();

    const allEvents: ServerEvent[] = [];
    for (const session of sessions) {
      const evtRes = await fetch(`${SERVER_URL}/sessions/${session.sessionId}/events?limit=200`);
      if (evtRes.ok) {
        const { events } = await evtRes.json();
        allEvents.push(...events);
      }
    }

    // Sort descending by timestamp
    allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return allEvents;
  } catch {
    return [];
  }
}

async function refreshFeed() {
  const events = await fetchAllEvents();
  if (events.length === 0) return;

  const newEvents = events.filter((e) => !seenEventIds.has(e.id));
  if (newEvents.length === 0) return;

  // Insert newest at the top (newEvents is already desc by timestamp)
  for (const event of newEvents.reverse()) {
    seenEventIds.add(event.id);
    const el = renderEvent(event);
    feedList.prepend(el);
  }
}

// ---------------------------------------------------------------------------
// SSE — real-time updates from the server
// ---------------------------------------------------------------------------
function connectSSE(sessionId: string) {
  const source = new EventSource(`${SERVER_URL}/sse/sessions/${sessionId}`);

  source.addEventListener('new-event', (e) => {
    const event: ServerEvent = JSON.parse(e.data);
    if (seenEventIds.has(event.id)) return;
    seenEventIds.add(event.id);
    const el = renderEvent(event);
    feedList.prepend(el);
  });

  source.addEventListener('error', () => {
    // EventSource auto-reconnects
  });

  return source;
}

// Track active SSE connections so we can connect to new sessions
const sseConnections = new Map<string, EventSource>();

async function syncSSEConnections() {
  try {
    const res = await fetch(`${SERVER_URL}/sessions?status=active`);
    if (!res.ok) return;
    const { sessions } = await res.json();

    for (const session of sessions) {
      if (!sseConnections.has(session.sessionId)) {
        const source = connectSSE(session.sessionId);
        sseConnections.set(session.sessionId, source);
      }
    }
  } catch {
    // Server might not be up yet
  }
}

// Initial load
refreshFeed();
syncSSEConnections();

// Poll for new sessions and as a fallback for events
setInterval(() => {
  refreshFeed();
  syncSSEConnections();
}, 3000);
