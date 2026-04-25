import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_INPUT_HEIGHT } from "./session-input-composer/constants";

interface MockComposerProps {
  inputHeight: number;
  onChangeText: (text: string) => void;
  onContentHeightChange: (height: number) => void;
  text: string;
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let latestComposerProps: MockComposerProps | null = null;
let latestOnSuccess: (() => void) | null = null;

vi.mock("react-native", () => ({
  Keyboard: { dismiss: vi.fn() },
  View: "View",
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

vi.mock("expo-clipboard", () => ({
  getImageAsync: vi.fn(),
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
}));

vi.mock("react-native-reanimated", () => {
  const AnimatedView = ({
    children,
    ...props
  }: { children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement("AnimatedView", props, children);
  return {
    default: {
      View: AnimatedView,
      createAnimatedComponent: (Component: React.ComponentType) => Component,
    },
    Easing: {
      ease: () => 0,
      inOut: () => () => 0,
    },
    LinearTransition: {
      duration: () => ({ easing: () => ({}) }),
    },
    SlideInRight: {
      duration: () => ({ easing: () => ({}) }),
    },
    SlideOutRight: {
      duration: () => ({ easing: () => ({}) }),
    },
    useAnimatedStyle: (factory: () => Record<string, unknown>) => factory(),
    useSharedValue: (initial: number) => ({ value: initial }),
    withTiming: (value: number) => value,
  };
});

vi.mock("@trace/client-core", () => ({
  DISMISS_SESSION_MUTATION: "dismiss",
  generateUUID: () => "uuid",
  useEntityField: (_entity: string, _id: string, field: string) => {
    switch (field) {
      case "agentStatus":
        return "idle";
      case "sessionStatus":
        return "running";
      case "worktreeDeleted":
        return false;
      case "tool":
        return "codex";
      case "model":
        return "gpt-5";
      case "hosting":
        return "cloud";
      case "connection":
        return { state: "connected", canRetry: false };
      case "channel":
        return { id: "channel-1" };
      case "_optimistic":
        return false;
      default:
        return null;
    }
  },
}));

vi.mock("@/hooks/useComposerSubmit", () => ({
  useComposerSubmit: (options: { onSuccess: () => void }) => {
    latestOnSuccess = options.onSuccess;
    return {
      submit: vi.fn(),
      sending: false,
    };
  },
}));

vi.mock("@/hooks/useClipboardImage", () => ({
  useClipboardImage: () => ({
    hasImage: false,
    refresh: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("@/hooks/useSlashCommands", () => ({
  useSlashCommands: () => ({
    commands: [],
  }),
}));

vi.mock("@/lib/haptics", () => ({
  haptic: {
    selection: vi.fn(),
    light: vi.fn(),
    medium: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/perf", () => ({
  recordPerf: vi.fn(),
}));

vi.mock("@/lib/urql", () => ({
  getClient: () => ({
    mutation: () => ({
      toPromise: async () => ({ error: null }),
    }),
  }),
}));

vi.mock("@/lib/createQuickSession", () => ({
  createQuickSession: vi.fn(),
}));

vi.mock("@/stores/drafts", () => ({
  useDraftsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      images: {},
      setImages: vi.fn(),
    }),
}));

vi.mock("@/theme", () => ({
  alpha: (color: string) => color,
  useTheme: () => ({
    colors: {
      accentForeground: "#fff",
      success: "#0f0",
      destructive: "#f00",
      foreground: "#111",
      dimForeground: "#777",
    },
    spacing: {
      md: 16,
      sm: 8,
      xs: 4,
    },
    motion: {
      durations: {
        fast: 0,
      },
    },
  }),
}));

vi.mock("./ComposerAttachButton", () => ({
  ComposerAttachButton: () => null,
}));

vi.mock("./ComposerConnectionNotice", () => ({
  ComposerConnectionNotice: () => null,
}));

vi.mock("./ComposerPasteButton", () => ({
  ComposerPasteButton: () => null,
}));

vi.mock("./ImageAttachmentBar", () => ({
  ImageAttachmentBar: () => null,
}));

vi.mock("./SessionModelPickerSheetContent", () => ({
  SessionModelPickerSheetContent: () => null,
}));

vi.mock("./SessionRuntimePickerSheetContent", () => ({
  SessionRuntimePickerSheetContent: () => null,
}));

vi.mock("./session-input-composer/SessionComposerActionButton", () => ({
  SessionComposerActionButton: () => null,
}));

vi.mock("./session-input-composer/SessionComposerBottomSheet", () => ({
  SessionComposerBottomSheet: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock("./session-input-composer/SessionComposerInputCard", () => ({
  SessionComposerInputCard: (props: MockComposerProps) => {
    latestComposerProps = props;
    return React.createElement("SessionComposerInputCard", props);
  },
}));

vi.mock("./session-input-composer/SessionComposerLeadingChips", () => ({
  SessionComposerLeadingChips: () => null,
}));

vi.mock("./session-input-composer/SessionComposerMeasurementLayer", () => ({
  SessionComposerMeasurementLayer: () => null,
}));

vi.mock("./session-input-composer/SessionComposerSlashCommandMenu", () => ({
  SessionComposerSlashCommandMenu: () => null,
}));

vi.mock("./session-input-composer/styles", () => ({
  styles: {
    composerStack: {},
    inputActionRow: {},
    inputCardSlot: {},
    slashMenuOverlay: {},
    attachButtonSlot: {},
  },
}));

vi.mock("./session-input-composer/useSessionComposerChips", () => ({
  useSessionComposerChips: () => ({
    cardBorderAnimatedStyle: {},
    chipAnimatedStyle: {},
    chipTextAnimatedStyle: {},
    glassAnimatedProps: {},
    handleModeMeasure: vi.fn(),
    handleModePress: vi.fn(),
    modeIconTint: "#fff",
    modeLabelVisible: true,
    modeWidthAnimatedStyle: {},
    resetChips: vi.fn(),
  }),
}));

vi.mock("./session-input-composer/useSessionComposerConfig", () => ({
  useSessionComposerConfig: () => ({
    modelLabel: "GPT-5",
  }),
}));

describe("SessionInputComposer", () => {
  beforeEach(() => {
    latestComposerProps = null;
    latestOnSuccess = null;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    }) as typeof requestAnimationFrame;
  });

  it("resets the composer height after a successful send", async () => {
    const { SessionInputComposer } = await import("./SessionInputComposer");

    await act(async () => {
      TestRenderer.create(React.createElement(SessionInputComposer, { sessionId: "session-1" }));
    });

    expect(latestComposerProps?.inputHeight).toBe(MIN_INPUT_HEIGHT);

    await act(async () => {
      latestComposerProps?.onChangeText?.("A tall draft");
      latestComposerProps?.onContentHeightChange?.(140);
    });

    expect(latestComposerProps?.inputHeight).toBe(140);
    expect(latestComposerProps?.text).toBe("A tall draft");

    await act(async () => {
      latestOnSuccess?.();
    });

    expect(latestComposerProps?.inputHeight).toBe(MIN_INPUT_HEIGHT);
    expect(latestComposerProps?.text).toBe("");
  });
});
