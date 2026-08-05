import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderSessionOutput } from "./event-output";
import type { NodeRenderContext } from "./render-context";

const components = vi.hoisted(() => ({
  AssistantMessage: () => null,
  CompletionRow: () => null,
  SubagentRow: () => null,
  SystemBadge: () => null,
  ToolCallRow: () => null,
}));

vi.mock("./AssistantMessage", () => ({ AssistantMessage: components.AssistantMessage }));
vi.mock("./CompletionRow", () => ({ CompletionRow: components.CompletionRow }));
vi.mock("./SubagentRow", () => ({ SubagentRow: components.SubagentRow }));
vi.mock("./SystemBadge", () => ({ SystemBadge: components.SystemBadge }));
vi.mock("./ToolCallRow", () => ({ ToolCallRow: components.ToolCallRow }));

const context: NodeRenderContext = {
  sessionId: "session-1",
  completedAgentTools: new Map(),
  toolResultByUseId: new Map(),
  gitCheckpointsByPromptEventId: new Map(),
};

describe("renderSessionOutput", () => {
  it("renders a login instruction instead of the raw auth failure on mobile", () => {
    const output = renderSessionOutput(
      {
        type: "auth_required",
        message: "Failed to authenticate: OAuth session expired",
      },
      context,
    );

    expect(isValidElement<{ text: string }>(output)).toBe(true);
    if (!isValidElement<{ text: string }>(output)) return;
    expect(output.type).toBe(components.SystemBadge);
    expect(output.props.text).toContain("run /login");
    expect(output.props.text).not.toContain("Failed to authenticate");
  });
});
