import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ArtifactsSheetContent } from "./ArtifactsSheetContent";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const artifactTable = {
  "artifact-1": {
    id: "artifact-1",
    sessionId: "session-1",
    manifest: {
      files: [{ path: "reports/status.pdf", mediaType: "application/pdf", size: 1024 }],
    },
  },
};

vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  ScrollView: ({ children }: { children: React.ReactNode }) =>
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

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@trace/client-core", () => ({
  useEntityStore: (selector: (state: { artifacts: typeof artifactTable }) => unknown) =>
    selector({ artifacts: artifactTable }),
}));

vi.mock("@/components/design-system", () => ({
  EmptyState: ({ title }: { title: string }) => React.createElement("Text", null, title),
  ListRow: ({ title, onPress }: { title: string; onPress: () => void }) =>
    React.createElement("ListRow", { onPress }, title),
  Text: ({ children }: { children: React.ReactNode }) =>
    React.createElement("Text", null, children),
  TraceLoader: () => React.createElement("TraceLoader"),
}));

vi.mock("@/lib/artifact-files", () => ({
  artifactFileName: (path: string) => path.split("/").pop(),
  formatArtifactFileSize: () => "1 KB",
  isHtmlArtifactFile: () => false,
  shareArtifactFile: vi.fn(),
}));

vi.mock("@/theme", () => ({
  useTheme: () => ({
    colors: {
      borderMuted: "#ddd",
      foreground: "#111",
      mutedForeground: "#777",
      surfaceElevated: "#fff",
    },
    radius: { lg: 12 },
    spacing: { xl: 24 },
  }),
}));

describe("ArtifactsSheetContent", () => {
  it("renders session artifacts from a stable entity-table selector", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <ArtifactsSheetContent sessionId="session-1" onClose={vi.fn()} />,
      );
    });

    expect(JSON.stringify(renderer.toJSON())).toContain("status.pdf");
  });
});
