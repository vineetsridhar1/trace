export type ToolShape = "spark" | "prompt" | "layers" | "orbit" | "chevron" | "bracket";

export type ToolState =
  | "update"
  | "current"
  | "missing"
  | "updating"
  | "installing"
  | "updated"
  | "installed"
  | "failed"
  | "queued";

export type Tool = {
  id: string;
  name: string;
  shape: ToolShape;
  command: string;
  sessionType: string;
  /** Claude Code and Codex stay top level even when they are not installed. */
  pinned: boolean;
  version: string | null;
  latest: string;
  size: string;
  state: ToolState;
  /** 0-100, only meaningful while updating or installing. */
  progress?: number;
  detail?: string;
};

const CLAUDE: Tool = {
  id: "claude-code",
  name: "Claude Code",
  shape: "spark",
  command: "claude",
  sessionType: "Claude Code sessions",
  pinned: true,
  version: "2.1.220",
  latest: "2.1.222",
  size: "48 MB",
  state: "update",
};

const CODEX: Tool = {
  id: "codex",
  name: "Codex",
  shape: "prompt",
  command: "codex",
  sessionType: "Codex sessions",
  pinned: true,
  version: "0.144.5",
  latest: "0.146.0",
  size: "36 MB",
  state: "update",
};

const PI: Tool = {
  id: "pi",
  name: "Pi",
  shape: "orbit",
  command: "pi",
  sessionType: "Pi sessions",
  pinned: false,
  version: "0.74.0",
  latest: "0.74.0",
  size: "21 MB",
  state: "current",
};

const ANTIGRAVITY: Tool = {
  id: "antigravity",
  name: "Antigravity",
  shape: "chevron",
  command: "agy",
  sessionType: "Antigravity sessions",
  pinned: false,
  version: null,
  latest: "1.8.3",
  size: "62 MB",
  state: "missing",
};

const CURSOR: Tool = {
  id: "cursor-composer",
  name: "Cursor Composer",
  shape: "bracket",
  command: "cursor-agent",
  sessionType: "Cursor Composer sessions",
  pinned: false,
  version: null,
  latest: "0.31.0",
  size: "74 MB",
  state: "missing",
};

/** Tools present on this computer, plus any pinned tool. Rendered top level. */
export const installedTools: Tool[] = [CLAUDE, CODEX, PI];

/** Tools absent from this computer. Collapsed into the accordion. */
export const availableTools: Tool[] = [ANTIGRAVITY, CURSOR];

export const allTools: Tool[] = [...installedTools, ...availableTools];

export const everythingReady: Tool[] = [
  { ...CLAUDE, version: "2.1.222", latest: "2.1.222", state: "current" },
  { ...CODEX, version: "0.146.0", latest: "0.146.0", state: "current" },
  PI,
];

export const updatingTools: Tool[] = [
  { ...CLAUDE, state: "updating", progress: 68 },
  { ...CODEX, state: "queued" },
  PI,
];

export const updatedTools: Tool[] = [
  { ...CLAUDE, version: "2.1.222", state: "updated" },
  { ...CODEX, version: "0.146.0", state: "updated" },
  PI,
];

export const failedTools: Tool[] = [
  { ...CLAUDE, version: "2.1.222", state: "updated" },
  {
    ...CODEX,
    state: "failed",
    detail: "Download failed after 3 attempts — registry returned 503.",
  },
  PI,
];

/**
 * Codex missing: still top level, because it is a primary session type. Everything
 * else is current so the artboard isolates the pinning rule from pending updates.
 */
export const pinnedMissingTools: Tool[] = [
  { ...CLAUDE, version: "2.1.222", latest: "2.1.222", state: "current" },
  { ...CODEX, version: null, state: "missing" },
  PI,
];

export const lastCheckedLabel = "Checked 4 minutes ago";

export function updateCount(tools: Tool[]): number {
  return tools.filter((tool) => tool.state === "update").length;
}
