import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowseChannelsSheetContent } from "./BrowseChannelsSheetContent";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let querySource = "";
const mutationMock = vi.fn();
const refreshOrgDataMock = vi.fn();

vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Pressable: ({
    children,
    onPress,
    disabled,
    accessibilityRole,
  }: {
    children: React.ReactNode;
    onPress: () => void;
    disabled?: boolean;
    accessibilityRole?: string;
  }) => React.createElement("Pressable", { accessibilityRole, disabled, onPress }, children),
  StyleSheet: {
    create: <T,>(styles: T) => styles,
    hairlineWidth: 1,
  },
  Text: ({ children }: { children: React.ReactNode }) =>
    React.createElement("Text", null, children),
  TextInput: () => React.createElement("TextInput"),
  View: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("View", null, children),
}));

vi.mock("@shopify/flash-list", () => ({
  FlashList: ({
    data,
    renderItem,
    ListEmptyComponent,
  }: {
    data: Array<unknown>;
    renderItem: (args: { item: unknown }) => React.ReactNode;
    ListEmptyComponent?: React.ReactNode;
  }) => (
    <view>
      {data.length === 0
        ? ListEmptyComponent
        : data.map((item, index) => (
            <React.Fragment key={index}>{renderItem({ item })}</React.Fragment>
          ))}
    </view>
  ),
}));

vi.mock("expo-symbols", () => ({
  SymbolView: () => React.createElement("SymbolView"),
}));

vi.mock("@trace/client-core", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ activeOrgId: "org-1", user: { id: "user-1" } }),
}));

vi.mock("@/components/design-system", () => ({
  Button: ({
    title,
    onPress,
    disabled,
  }: {
    title: string;
    onPress: () => void;
    disabled?: boolean;
  }) =>
    React.createElement(
      "button",
      { accessibilityRole: "button", disabled, onPress },
      React.createElement("text", null, title),
    ),
  EmptyState: ({ title }: { title: string }) => <text>{title}</text>,
  Text: ({ children }: { children: React.ReactNode }) => <text>{children}</text>,
  TraceLoader: () => <text>Loading</text>,
}));

vi.mock("@/hooks/useHydrate", () => ({
  refreshOrgData: (...args: unknown[]) => refreshOrgDataMock(...args),
}));

vi.mock("@/lib/haptics", () => ({
  haptic: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/requestError", () => ({
  userFacingError: (_error: unknown, fallback: string) => fallback,
}));

vi.mock("@/lib/urql", () => ({
  getClient: () => ({
    query: (query: { loc?: { source: { body: string } } }) => {
      querySource = query.loc?.source.body ?? "";
      return {
        toPromise: async () => ({
          data: {
            channels: [
              {
                id: "channel-1",
                name: "backend",
                type: "coding",
                memberCount: 2,
                viewerIsMember: false,
              },
            ],
          },
        }),
      };
    },
    mutation: (...args: unknown[]) => {
      mutationMock(...args);
      return { toPromise: async () => ({ data: { joinChannel: { id: "channel-1" } } }) };
    },
  }),
}));

vi.mock("@/theme", () => ({
  useTheme: () => ({
    colors: {
      accent: "#00a",
      border: "#ccc",
      borderMuted: "#ddd",
      foreground: "#111",
      mutedForeground: "#777",
      surfaceElevated: "#fff",
    },
    radius: { lg: 12 },
  }),
}));

describe("BrowseChannelsSheetContent", () => {
  beforeEach(() => {
    querySource = "";
    mutationMock.mockClear();
    refreshOrgDataMock.mockReset();
    refreshOrgDataMock.mockResolvedValue(undefined);
  });

  it("loads lightweight browse data and joins a channel", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<BrowseChannelsSheetContent />);
    });

    expect(querySource).toContain("memberCount");
    expect(querySource).toContain("viewerIsMember");
    expect(querySource).not.toContain("members {");
    expect(renderer.root.findAllByProps({ children: "backend" }).length).toBeGreaterThan(0);

    const joinButton = renderer.root.findByProps({ accessibilityRole: "button" });
    await act(async () => {
      joinButton.props.onPress();
    });

    expect(mutationMock).toHaveBeenCalledWith(expect.anything(), { channelId: "channel-1" });
    expect(refreshOrgDataMock).toHaveBeenCalledWith("org-1");
    expect(renderer.root.findAllByProps({ children: "Joined" }).length).toBeGreaterThan(0);
    expect(JSON.stringify(renderer.toJSON())).toContain("3");
    expect(JSON.stringify(renderer.toJSON())).toContain("members");
  });
});
