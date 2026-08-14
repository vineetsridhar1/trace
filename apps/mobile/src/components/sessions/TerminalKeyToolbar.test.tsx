import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { getStringAsync } = vi.hoisted(() => ({ getStringAsync: vi.fn() }));

vi.mock("expo-clipboard", () => ({ getStringAsync }));

vi.mock("react-native", () => ({
  Pressable: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement("Pressable", props, children),
  ScrollView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("ScrollView", null, children),
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
  View: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("View", null, children),
}));

vi.mock("@/components/design-system", () => ({
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("Text", null, children),
}));

vi.mock("@/theme", () => ({
  useTheme: () => ({
    colors: {
      border: "#111",
      foreground: "#fff",
      surface: "#222",
      surfaceElevated: "#333",
    },
  }),
}));

import { TerminalKeyToolbar } from "./TerminalKeyToolbar";

function button(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root.findAll((node) => node.props.accessibilityLabel === label)[0];
}

describe("TerminalKeyToolbar", () => {
  const onCopy = vi.fn();
  const onInput = vi.fn();

  beforeEach(() => {
    getStringAsync.mockReset();
    onCopy.mockReset();
    onInput.mockReset();
  });

  it("forwards pasted text, terminal interrupt, and copy actions", async () => {
    getStringAsync.mockResolvedValue("pnpm dev\n");
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <TerminalKeyToolbar disabled={false} onCopy={onCopy} onInput={onInput} />,
      );
    });

    await act(async () => button(renderer, "Paste").props.onPress());
    await act(async () => button(renderer, "Control C (interrupt)").props.onPress());
    await act(async () => button(renderer, "Copy").props.onPress());

    expect(onInput).toHaveBeenNthCalledWith(1, "pnpm dev\n");
    expect(onInput).toHaveBeenNthCalledWith(2, "\u0003");
    expect(onCopy).toHaveBeenCalledOnce();
  });
});
