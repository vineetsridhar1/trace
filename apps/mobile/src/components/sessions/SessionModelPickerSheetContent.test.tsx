import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let sessionState: Record<string, unknown> = {};
const handleToolChangeMock = vi.fn();

vi.mock("react-native", () => ({
  ScrollView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("ScrollView", null, children),
  StyleSheet: {
    create: <T,>(styles: T) => styles,
    hairlineWidth: 1,
  },
  View: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("View", null, children),
}));

vi.mock("expo-symbols", () => ({
  SymbolView: () => React.createElement("SymbolView"),
}));

vi.mock("@trace/client-core", () => ({
  useEntityField: (_type: string, _id: string, field: string) => sessionState[field],
}));

vi.mock("@trace/shared", () => ({
  getDefaultModel: (tool: string) =>
    tool === "claude_code" ? "claude-default" : tool === "codex" ? "codex-default" : "pi-default",
  getDefaultReasoningEffort: (tool: string) => (tool === "codex" ? "medium" : null),
  getModelProviderGroupsForTool: () => [],
}));

vi.mock("@/components/design-system", () => ({
  ListRow: ({
    title,
    trailing,
    onPress,
  }: {
    title: string;
    trailing?: React.ReactNode;
    onPress?: () => void;
  }) =>
    React.createElement("ListRow", { title, trailing, onPress }),
  Text: ({ children }: { children?: React.ReactNode }) => React.createElement("Text", null, children),
}));

vi.mock("@/theme", () => ({
  useTheme: () => ({
    colors: { accent: "#00a", borderMuted: "#ddd", surfaceElevated: "#fff" },
    radius: { lg: 12 },
  }),
}));

vi.mock("./session-input-composer/useSessionComposerConfig", () => ({
  useSessionComposerConfig: (opts: { currentTool: string; model?: string | null }) => ({
    currentTool: opts.currentTool,
    model: opts.model ?? null,
    modelOptions: [
      { value: "claude-default", label: "Claude Default" },
      { value: "codex-default", label: "Codex Default" },
    ],
    reasoningEffort: null,
    reasoningEffortOptions: [],
    toolOptions: [
      { value: "claude_code", label: "Claude Code" },
      { value: "codex", label: "Codex" },
      { value: "pi", label: "Pi" },
    ],
    handleModelChange: vi.fn(),
    handleReasoningEffortChange: vi.fn(),
    handleToolChange: handleToolChangeMock,
  }),
}));

import { SessionModelPickerSheetContent } from "./SessionModelPickerSheetContent";

function toolRow(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root.findAll((node) => node.props.title === label)[0];
}

function isSelected(renderer: TestRenderer.ReactTestRenderer, label: string) {
  // A row renders a `trailing` checkmark element only when it is the active selection.
  return Boolean(toolRow(renderer, label).props.trailing);
}

describe("SessionModelPickerSheetContent", () => {
  beforeEach(() => {
    handleToolChangeMock.mockReset();
    sessionState = {
      tool: "codex",
      model: "codex-default",
      reasoningEffort: null,
      agentStatus: "idle",
      sessionStatus: "active",
      worktreeDeleted: false,
      _optimistic: false,
      connection: { state: "connected" },
      hosting: "local",
    };
  });

  it("shows the selected tool immediately while the mutation is in flight", async () => {
    handleToolChangeMock.mockResolvedValue(true);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<SessionModelPickerSheetContent sessionId="s1" />);
    });

    expect(isSelected(renderer, "Codex")).toBe(true);
    expect(isSelected(renderer, "Claude Code")).toBe(false);

    await act(async () => {
      toolRow(renderer, "Claude Code").props.onPress();
    });

    expect(handleToolChangeMock).toHaveBeenCalledWith("claude_code");
    // Store still reports codex, but the pending selection drives the display.
    expect(isSelected(renderer, "Claude Code")).toBe(true);
    expect(isSelected(renderer, "Codex")).toBe(false);
  });

  it("reverts to the previous tool when the tool change fails", async () => {
    handleToolChangeMock.mockResolvedValue(false);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<SessionModelPickerSheetContent sessionId="s1" />);
    });

    await act(async () => {
      toolRow(renderer, "Claude Code").props.onPress();
    });

    expect(isSelected(renderer, "Codex")).toBe(true);
    expect(isSelected(renderer, "Claude Code")).toBe(false);
  });

  it("clears pending state once the store converges so later store changes win", async () => {
    handleToolChangeMock.mockResolvedValue(true);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<SessionModelPickerSheetContent sessionId="s1" />);
    });

    await act(async () => {
      toolRow(renderer, "Claude Code").props.onPress();
    });
    expect(isSelected(renderer, "Claude Code")).toBe(true);

    // Store catches up to the new tool: the clear-on-converge effect drops pending state.
    await act(async () => {
      sessionState = { ...sessionState, tool: "claude_code", model: "claude-default" };
      renderer.update(<SessionModelPickerSheetContent sessionId="s1" />);
    });
    expect(isSelected(renderer, "Claude Code")).toBe(true);

    // A later store-driven change is now reflected, proving pending was cleared.
    await act(async () => {
      sessionState = { ...sessionState, tool: "codex", model: "codex-default" };
      renderer.update(<SessionModelPickerSheetContent sessionId="s1" />);
    });
    expect(isSelected(renderer, "Codex")).toBe(true);
    expect(isSelected(renderer, "Claude Code")).toBe(false);
  });
});
