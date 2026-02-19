import './index.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

// Type declaration for the API exposed via preload
interface LogEntry {
  id: number;
  event_type: string;
  tool_name: string | null;
  input_json: string;
  timestamp: string;
}

interface TraceAPI {
  onPtyData: (cb: (data: string) => void) => () => void;
  onPtyExit: (cb: (code: number) => void) => () => void;
  sendPtyInput: (data: string) => void;
  resizePty: (cols: number, rows: number) => void;
  getLogs: (limit?: number) => Promise<LogEntry[]>;
  onNewLogEvent: (cb: () => void) => () => void;
}

declare global {
  interface Window {
    traceAPI: TraceAPI;
  }
}

// ---------------------------------------------------------------------------
// Terminal setup
// ---------------------------------------------------------------------------
const terminalContainer = document.getElementById('terminal-container')!;

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
// Activity Feed
// ---------------------------------------------------------------------------
const feedList = document.getElementById('feed-list')!;
let lastSeenId = 0;

function eventIcon(eventType: string): string {
  switch (eventType) {
    case 'PostToolUse':     return '🔧';
    case 'UserPromptSubmit': return '💬';
    case 'Stop':            return '🛑';
    default:                return '📌';
  }
}

function renderLogEntry(entry: LogEntry): HTMLElement {
  const el = document.createElement('div');
  el.className = 'feed-item';

  const icon = eventIcon(entry.event_type);
  const toolLabel = entry.tool_name ? `<span class="tool-name">${entry.tool_name}</span>` : '';
  const time = new Date(entry.timestamp + 'Z').toLocaleTimeString();

  el.innerHTML = `
    <div class="feed-item-header">
      <span class="feed-icon">${icon}</span>
      <span class="feed-event-type">${entry.event_type}</span>
      ${toolLabel}
      <span class="feed-time">${time}</span>
    </div>
  `;

  // Expand on click to show raw JSON
  el.addEventListener('click', () => {
    const existing = el.querySelector('.feed-detail');
    if (existing) {
      existing.remove();
      return;
    }
    const detail = document.createElement('pre');
    detail.className = 'feed-detail';
    try {
      detail.textContent = JSON.stringify(JSON.parse(entry.input_json), null, 2);
    } catch {
      detail.textContent = entry.input_json;
    }
    el.appendChild(detail);
  });

  return el;
}

async function refreshFeed() {
  const logs: LogEntry[] = await window.traceAPI.getLogs(200);
  if (logs.length === 0) return;

  // logs come in DESC order; find new ones
  const newEntries = logs.filter((l) => l.id > lastSeenId);
  if (newEntries.length === 0) return;

  // Insert newest at the top
  for (const entry of newEntries.reverse()) {
    const el = renderLogEntry(entry);
    feedList.prepend(el);
  }

  lastSeenId = logs[0].id;
}

// Initial load
refreshFeed();

// Listen for real-time push from main process
window.traceAPI.onNewLogEvent(() => refreshFeed());

// Also poll as a fallback every 3 seconds
setInterval(refreshFeed, 3000);
