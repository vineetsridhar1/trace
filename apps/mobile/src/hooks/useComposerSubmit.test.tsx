import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useComposerSubmit, type ComposerMode } from "./useComposerSubmit";

interface MockDraftAttachment {
  id: string;
  filename: string;
  mimeType: string;
  base64?: string;
  fileUri?: string;
  size?: number;
  previewUri?: string;
  width: number | null;
  height: number | null;
  s3Key: string | null;
  uploading: boolean;
}

interface MockDraftState {
  attachments: Record<string, MockDraftAttachment[]>;
  setAttachments: (
    sessionId: string,
    update: MockDraftAttachment[] | ((prev: MockDraftAttachment[]) => MockDraftAttachment[]),
  ) => void;
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let submit: ((draft: string, mode: ComposerMode) => Promise<void>) | null = null;
let draftState: MockDraftState;
let isActive = false;
let mutationName: unknown = null;
let mutationVariables: Record<string, unknown> | null = null;
const onFailure = vi.fn();
const onSuccess = vi.fn();
const uploadFileMock = vi.fn();
const optimisticallyInsertSessionMessageMock = vi.fn(
  (_sessionId: string, _text: string, _options?: unknown) => ({
    eventId: "optimistic-event",
    clientMutationId: "client-mutation",
  }),
);
const reconcileOptimisticSessionMessageMock = vi.fn(
  (_sessionId: string, _eventId: string, _realId: string) => undefined,
);
const removeOptimisticSessionMessageMock = vi.fn(
  (_sessionId: string, _eventId: string) => undefined,
);
let entityState: {
  sessions: Record<string, Record<string, unknown>>;
  patch: (entity: string, id: string, patch: Record<string, unknown>) => void;
};

vi.mock("@trace/client-core", () => ({
  optimisticallyInsertSessionMessage: (...args: [string, string, unknown?]) =>
    optimisticallyInsertSessionMessageMock(...args),
  QUEUE_SESSION_MESSAGE_MUTATION: "queueSessionMessage",
  reconcileOptimisticSessionMessage: (...args: [string, string, string]) =>
    reconcileOptimisticSessionMessageMock(...args),
  removeOptimisticSessionMessage: (...args: [string, string]) =>
    removeOptimisticSessionMessageMock(...args),
  SEND_SESSION_MESSAGE_MUTATION: "sendSessionMessage",
  useAuthStore: {
    getState: () => ({ activeOrgId: "org-1" }),
  },
  useEntityStore: {
    getState: () => entityState,
  },
  wrapPrompt: (_mode: ComposerMode, draft: string) => `wrapped:${draft}`,
}));

vi.mock("@/lib/haptics", () => ({
  haptic: {
    light: vi.fn(),
  },
}));

vi.mock("@/lib/requestError", () => ({
  userFacingError: (_error: unknown, fallback: string) => fallback,
}));

vi.mock("@/lib/upload", () => ({
  uploadFile: (...args: unknown[]) => uploadFileMock(...args),
}));

vi.mock("@/lib/urql", () => ({
  getClient: () => ({
    mutation: (mutation: unknown, variables: Record<string, unknown>) => {
      mutationName = mutation;
      mutationVariables = variables;
      return {
        toPromise: async () =>
          mutation === "queueSessionMessage"
            ? { data: { queueSessionMessage: { id: "queued-message" } } }
            : { data: { sendSessionMessage: { id: "real-event" } } },
      };
    },
  }),
}));

vi.mock("@/stores/drafts", () => ({
  useDraftsStore: {
    getState: () => draftState,
  },
}));

function Harness() {
  const result = useComposerSubmit({
    sessionId: "session-1",
    isActive,
    onFailure,
    onSuccess,
  });
  submit = result.submit;
  return null;
}

describe("useComposerSubmit", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    submit = null;
    isActive = false;
    mutationName = null;
    mutationVariables = null;
    onFailure.mockClear();
    onSuccess.mockClear();
    uploadFileMock.mockReset();
    optimisticallyInsertSessionMessageMock.mockClear();
    reconcileOptimisticSessionMessageMock.mockClear();
    removeOptimisticSessionMessageMock.mockClear();
    entityState = {
      sessions: {
        "session-1": {
          id: "session-1",
          agentStatus: "done",
          sessionStatus: "in_progress",
          hosting: "cloud",
          workdir: "/workspace",
          connection: { state: "connected" },
        },
      },
      patch: (_entity, id, patch) => {
        entityState.sessions[id] = { ...(entityState.sessions[id] ?? {}), ...patch };
      },
    };
    draftState = {
      attachments: {
        "session-1": [
          {
            id: "attachment-1",
            filename: "notes.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            fileUri: "file:///tmp/notes.docx",
            size: 1024,
            width: null,
            height: null,
            s3Key: null,
            uploading: false,
          },
        ],
      },
      setAttachments: (sessionId, update) => {
        const prev = draftState.attachments[sessionId] ?? [];
        const next = typeof update === "function" ? update(prev) : update;
        if (next.length === 0) {
          const { [sessionId]: _removed, ...rest } = draftState.attachments;
          draftState.attachments = rest;
          return;
        }
        draftState.attachments = { ...draftState.attachments, [sessionId]: next };
      },
    };
  });

  it("uploads generic attachments with filename and sends attachment keys", async () => {
    uploadFileMock.mockResolvedValueOnce("uploads/org-1/key-notes.docx");

    await act(async () => {
      TestRenderer.create(<Harness />);
    });

    await act(async () => {
      await submit?.("please read this", "code");
    });

    expect(uploadFileMock).toHaveBeenCalledWith({
      base64: undefined,
      fileUri: "file:///tmp/notes.docx",
      filename: "notes.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 1024,
      organizationId: "org-1",
    });
    expect(mutationVariables).toMatchObject({
      sessionId: "session-1",
      text: "wrapped:please read this",
      attachmentKeys: ["uploads/org-1/key-notes.docx"],
      clientMutationId: "client-mutation",
    });
    expect(draftState.attachments["session-1"]).toBeUndefined();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
    expect(reconcileOptimisticSessionMessageMock).toHaveBeenCalledWith(
      "session-1",
      "optimistic-event",
      "real-event",
    );
  });

  it("uploads attachments and passes attachment keys when queueing active session messages", async () => {
    isActive = true;
    uploadFileMock.mockResolvedValueOnce("uploads/org-1/key-notes.docx");

    await act(async () => {
      TestRenderer.create(<Harness />);
    });

    await act(async () => {
      await submit?.("", "code");
    });

    expect(mutationName).toBe("queueSessionMessage");
    expect(uploadFileMock).toHaveBeenCalledWith({
      base64: undefined,
      fileUri: "file:///tmp/notes.docx",
      filename: "notes.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 1024,
      organizationId: "org-1",
    });
    expect(mutationVariables).toMatchObject({
      sessionId: "session-1",
      text: "",
      attachmentKeys: ["uploads/org-1/key-notes.docx"],
    });
    expect(draftState.attachments["session-1"]).toBeUndefined();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
    expect(reconcileOptimisticSessionMessageMock).not.toHaveBeenCalled();
  });

  it("switches deferred cloud sessions to the runtime startup state immediately", async () => {
    draftState.attachments = {};
    entityState.sessions["session-1"] = {
      id: "session-1",
      agentStatus: "not_started",
      sessionStatus: "in_progress",
      hosting: "cloud",
      workdir: null,
      connection: { state: "pending" },
    };

    await act(async () => {
      TestRenderer.create(<Harness />);
    });

    await act(async () => {
      await submit?.("start this", "code");
    });

    expect(entityState.sessions["session-1"]).toMatchObject({
      agentStatus: "active",
      sessionStatus: "in_progress",
      connection: { state: "requested" },
    });
    expect(optimisticallyInsertSessionMessageMock).toHaveBeenCalledWith(
      "session-1",
      "wrapped:start this",
      { deliveryStatus: "pending_runtime" },
    );
  });
});
