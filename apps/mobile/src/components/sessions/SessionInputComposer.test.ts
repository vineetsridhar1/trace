import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_INPUT_HEIGHT } from "./session-input-composer/constants";

interface MockComposerProps {
  errorDraft: string | null;
  errorMessage: string | null;
  inputHeight: number;
  onChangeText: (text: string) => void;
  onContentHeightChange: (height: number) => void;
  onRetry: () => void;
  text: string;
}

interface MockAttachButtonProps {
  enabled: boolean;
  onPress: () => void;
}

interface MockAttachmentSheetProps {
  disabled?: boolean;
  onPickFiles: () => void;
  onPickImages: () => void;
}

interface MockActionButtonProps {
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
}

interface MockDraftAttachment {
  id: string;
  filename: string;
  mimeType: string;
  fileUri?: string;
  size?: number;
  previewUri?: string;
  width: number | null;
  height: number | null;
  s3Key: string | null;
  uploading: boolean;
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  await Promise.resolve();
}

async function waitForDraftAttachmentCount(count: number): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await act(async () => {
      await flushAsyncWork();
    });
    if (draftAttachments.length === count) return;
  }
  throw new Error(`Expected ${count} draft attachment(s), found ${draftAttachments.length}`);
}

let latestComposerProps: MockComposerProps | null = null;
let latestAttachButtonProps: MockAttachButtonProps | null = null;
let latestAttachmentSheetProps: MockAttachmentSheetProps | null = null;
let latestActionButtonProps: MockActionButtonProps | null = null;
let latestOnFailure: ((draft: string, message: string) => void) | null = null;
let latestOnSuccess: (() => void) | null = null;
let draftAttachments: MockDraftAttachment[] = [];
let mockTool = "codex";
let mockAgentStatus = "idle";
let mockSessionGroupKind: string | null = null;
let runtimePickerRenderCount = 0;
const submitMock = vi.fn();
const routerPushMock = vi.fn();

vi.mock("react-native", () => ({
  AccessibilityInfo: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    isReduceMotionEnabled: vi.fn(async () => false),
  },
  Keyboard: { dismiss: vi.fn() },
  View: "View",
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

vi.mock("expo-clipboard", () => ({
  getImageAsync: vi.fn(),
}));

vi.mock("expo-document-picker", () => ({
  getDocumentAsync: vi.fn(),
}));

vi.mock("expo-file-system", () => ({
  File: {
    pickFileAsync: vi.fn(),
  },
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({
    push: routerPushMock,
  }),
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
  hasSelectedSessionGroupRuntime: (
    connection: {
      runtimeInstanceId?: string | null;
      environmentId?: string | null;
      providerRuntimeId?: string | null;
      adapterType?: string | null;
    } | null,
    workdir: string | null,
  ) =>
    Boolean(
      workdir ||
        connection?.runtimeInstanceId ||
        connection?.environmentId ||
        connection?.providerRuntimeId ||
        connection?.adapterType === "provisioned",
    ),
  useEntityField: (_entity: string, _id: string, field: string) => {
    switch (field) {
      case "agentStatus":
        return mockAgentStatus;
      case "sessionStatus":
        return "running";
      case "worktreeDeleted":
        return false;
      case "tool":
        return mockTool;
      case "model":
        return "gpt-5";
      case "hosting":
        return "cloud";
      case "connection":
        return { state: "connected", canRetry: false };
      case "channel":
        return { id: "channel-1" };
      case "sessionGroupId":
        return "group-1";
      case "kind":
        return mockSessionGroupKind;
      case "_optimistic":
        return false;
      default:
        return null;
    }
  },
}));

vi.mock("@/hooks/useComposerSubmit", () => ({
  useComposerSubmit: (options: {
    onFailure: (draft: string, message: string) => void;
    onSuccess: () => void;
  }) => {
    latestOnFailure = options.onFailure;
    latestOnSuccess = options.onSuccess;
    return {
      submit: submitMock,
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
  useDraftsStore: (
    selector: (state: {
      attachments: Record<string, MockDraftAttachment[]>;
      setAttachments: (
        sessionId: string,
        update: MockDraftAttachment[] | ((prev: MockDraftAttachment[]) => MockDraftAttachment[]),
      ) => void;
    }) => unknown,
  ) =>
    selector({
      attachments: { "session-1": draftAttachments },
      setAttachments: (_sessionId, update) => {
        draftAttachments = typeof update === "function" ? update(draftAttachments) : update;
      },
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
  ComposerAttachButton: (props: MockAttachButtonProps) => {
    latestAttachButtonProps = props;
    return React.createElement("ComposerAttachButton", props);
  },
}));

vi.mock("./ComposerConnectionNotice", () => ({
  ComposerConnectionNotice: () => null,
}));

vi.mock("./ComposerPasteButton", () => ({
  ComposerPasteButton: () => null,
}));

vi.mock("./AttachmentBar", () => ({
  AttachmentBar: () => null,
}));

vi.mock("./AttachmentPickerSheetContent", () => ({
  AttachmentPickerSheetContent: (props: MockAttachmentSheetProps) => {
    latestAttachmentSheetProps = props;
    return React.createElement("AttachmentPickerSheetContent", props);
  },
}));

vi.mock("./SessionModelPickerSheetContent", () => ({
  SessionModelPickerSheetContent: () => null,
}));

vi.mock("./SessionRuntimePickerSheetContent", () => ({
  SessionRuntimePickerSheetContent: () => {
    runtimePickerRenderCount += 1;
    return null;
  },
}));

vi.mock("./session-input-composer/SessionComposerActionButton", () => ({
  SessionComposerActionButton: (props: MockActionButtonProps) => {
    latestActionButtonProps = props;
    return React.createElement("SessionComposerActionButton", props);
  },
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
    latestAttachButtonProps = null;
    latestAttachmentSheetProps = null;
    latestActionButtonProps = null;
    latestOnFailure = null;
    latestOnSuccess = null;
    draftAttachments = [];
    mockTool = "codex";
    mockAgentStatus = "idle";
    mockSessionGroupKind = null;
    runtimePickerRenderCount = 0;
    submitMock.mockClear();
    routerPushMock.mockClear();
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

  it("keeps attachment-only failures retryable", async () => {
    const { SessionInputComposer } = await import("./SessionInputComposer");

    await act(async () => {
      TestRenderer.create(React.createElement(SessionInputComposer, { sessionId: "session-1" }));
    });

    await act(async () => {
      latestOnFailure?.("", "Failed to send attachment");
    });

    expect(latestComposerProps?.errorDraft).toBe("");
    expect(latestComposerProps?.errorMessage).toBe("Failed to send attachment");

    await act(async () => {
      latestComposerProps?.onRetry();
    });

    expect(submitMock).toHaveBeenCalledWith("", "code");
  });

  it("opens Pi login in the terminal pane instead of submitting it as a prompt", async () => {
    mockTool = "pi";
    const { useMobileUIStore } = await import("@/stores/ui");
    useMobileUIStore.getState().reset();
    const { SessionInputComposer } = await import("./SessionInputComposer");

    await act(async () => {
      TestRenderer.create(React.createElement(SessionInputComposer, { sessionId: "session-1" }));
    });

    await act(async () => {
      latestComposerProps?.onChangeText?.("/login");
    });

    await act(async () => {
      latestActionButtonProps?.onPress();
    });

    expect(submitMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith("/sessions/group-1/session-1?pane=terminal");
    expect(useMobileUIStore.getState().consumeTerminalInitialCommand("session-1")).toBe(
      "pi\n/login",
    );
  });

  it.each(["app", "design"])(
    "sends a new cloud-only %s session without opening the runtime picker",
    async (kind) => {
      mockAgentStatus = "not_started";
      mockSessionGroupKind = kind;
      const { SessionInputComposer } = await import("./SessionInputComposer");

      await act(async () => {
        TestRenderer.create(React.createElement(SessionInputComposer, { sessionId: "session-1" }));
      });
      await act(async () => {
        latestComposerProps?.onChangeText?.("Start from this brief");
      });
      await act(async () => {
        latestActionButtonProps?.onPress();
      });

      expect(submitMock).toHaveBeenCalledWith("Start from this brief", "code");
      expect(runtimePickerRenderCount).toBe(0);
    },
  );

  it("opens an attachment sheet and stores picked files", async () => {
    const DocumentPicker = await import("expo-document-picker");
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: "notes.docx",
          uri: "file:///tmp/notes.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: 1234,
          lastModified: Date.now(),
        },
      ],
    });

    const { SessionInputComposer } = await import("./SessionInputComposer");

    await act(async () => {
      TestRenderer.create(React.createElement(SessionInputComposer, { sessionId: "session-1" }));
    });

    expect(latestAttachButtonProps?.enabled).toBe(true);

    await act(async () => {
      latestAttachButtonProps?.onPress();
    });

    expect(latestAttachmentSheetProps).not.toBeNull();

    await act(async () => {
      latestAttachmentSheetProps?.onPickFiles();
    });
    await waitForDraftAttachmentCount(1);

    expect(draftAttachments).toMatchObject([
      {
        filename: "notes.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileUri: "file:///tmp/notes.docx",
        size: 1234,
      },
    ]);
  });

  it("falls back to the file-system picker when document picker is unavailable", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const DocumentPicker = await import("expo-document-picker");
    const FileSystem = await import("expo-file-system");
    vi.mocked(DocumentPicker.getDocumentAsync).mockRejectedValueOnce(new Error("native missing"));
    vi.mocked(FileSystem.File.pickFileAsync).mockResolvedValueOnce({
      uri: "file:///tmp/fallback.zip",
      type: "application/zip",
      size: 321,
    } as Awaited<ReturnType<typeof FileSystem.File.pickFileAsync>>);

    const { SessionInputComposer } = await import("./SessionInputComposer");

    await act(async () => {
      TestRenderer.create(React.createElement(SessionInputComposer, { sessionId: "session-1" }));
    });

    await act(async () => {
      latestAttachButtonProps?.onPress();
    });

    await act(async () => {
      latestAttachmentSheetProps?.onPickFiles();
    });
    await waitForDraftAttachmentCount(1);

    expect(draftAttachments).toMatchObject([
      {
        filename: "fallback.zip",
        mimeType: "application/zip",
        fileUri: "file:///tmp/fallback.zip",
        size: 321,
      },
    ]);
    expect(FileSystem.File.pickFileAsync).toHaveBeenCalledWith();
    warnSpy.mockRestore();
  });

  it("adds a MIME-derived extension for picked image URIs without filenames", async () => {
    const ImagePicker = await import("expo-image-picker");
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: "content://media/external/images/12345",
          width: 320,
          height: 240,
          mimeType: "image/png",
        },
      ],
    });

    const { SessionInputComposer } = await import("./SessionInputComposer");

    await act(async () => {
      TestRenderer.create(React.createElement(SessionInputComposer, { sessionId: "session-1" }));
    });

    await act(async () => {
      latestAttachButtonProps?.onPress();
    });

    await act(async () => {
      latestAttachmentSheetProps?.onPickImages();
    });
    await waitForDraftAttachmentCount(1);

    expect(draftAttachments).toMatchObject([
      {
        filename: "12345.png",
        mimeType: "image/png",
        fileUri: "content://media/external/images/12345",
        previewUri: "content://media/external/images/12345",
      },
    ]);
  });
});
