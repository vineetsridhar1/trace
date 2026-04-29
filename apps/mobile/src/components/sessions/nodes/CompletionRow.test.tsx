import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { CompletionRow } from "./CompletionRow";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  View: "View",
}));

vi.mock("expo-symbols", () => ({
  SymbolView: "SymbolView",
}));

vi.mock("@/components/design-system", () => ({
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("Text", null, children),
}));

vi.mock("@/theme", () => ({
  useTheme: () => ({
    colors: {
      destructive: "#f00",
      foreground: "#111",
      mutedForeground: "#777",
    },
    spacing: {
      xs: 4,
    },
  }),
}));

vi.mock("./Markdown", () => ({
  Markdown: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("Markdown", null, children),
}));

function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (value && typeof value === "object" && "children" in value) {
    return textContent((value as { children?: unknown }).children);
  }
  return "";
}

describe("CompletionRow", () => {
  it("renders failed completion title and detail", () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CompletionRow title="Run failed" result="adapter crashed" tone="error" />,
      );
    });

    expect(textContent(renderer.toJSON())).toContain("Run failed");
    expect(textContent(renderer.toJSON())).toContain("adapter crashed");
  });
});
