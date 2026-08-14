export type CodingToolShape = "spark" | "prompt" | "orbit" | "chevron" | "bracket";

export const CODING_TOOL_PRESENTATION: Readonly<
  Record<string, { command: string; shape: CodingToolShape; primary: boolean; size: string }>
> = {
  claude_code: { command: "claude", shape: "spark", primary: true, size: "48 MB" },
  codex: { command: "codex", shape: "prompt", primary: true, size: "36 MB" },
  pi: { command: "pi", shape: "orbit", primary: false, size: "21 MB" },
  antigravity: { command: "agy", shape: "chevron", primary: false, size: "62 MB" },
  cursor_composer: {
    command: "cursor-agent",
    shape: "bracket",
    primary: false,
    size: "74 MB",
  },
};
