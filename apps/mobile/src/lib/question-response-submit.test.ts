import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileAttachment } from "@/stores/drafts";
import { submitQuestionResponse } from "./question-response-submit";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(() => ({ eventId: "optimistic-event", clientMutationId: "mutation-1" })),
  mutation: vi.fn(),
  reconcile: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@trace/client-core", () => ({
  optimisticallyInsertSessionMessage: mocks.insert,
  reconcileOptimisticSessionMessage: mocks.reconcile,
  removeOptimisticSessionMessage: mocks.remove,
  SEND_SESSION_MESSAGE_MUTATION: "sendSessionMessage",
}));

vi.mock("./upload", () => ({ uploadFile: mocks.upload }));

vi.mock("./urql", () => ({
  getClient: () => ({ mutation: mocks.mutation }),
}));

const attachment: FileAttachment = {
  id: "attachment-1",
  filename: "wireframe.png",
  mimeType: "image/png",
  fileUri: "file:///tmp/wireframe.png",
  previewUri: "file:///tmp/wireframe.png",
  size: 128,
  width: 100,
  height: 80,
  s3Key: null,
  uploading: false,
};

describe("submitQuestionResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue("org/org-1/wireframe.png");
    mocks.mutation.mockReturnValue({
      toPromise: async () => ({ data: { sendSessionMessage: { id: "event-1" } } }),
    });
  });

  it("uploads references and sends their keys with the structured response", async () => {
    const onAttachmentsUploaded = vi.fn();
    const uploaded = await submitQuestionResponse({
      sessionId: "session-1",
      text: "<trace:input-response />",
      interactionMode: "plan",
      attachments: [attachment],
      organizationId: "org-1",
      onAttachmentsUploaded,
    });

    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        fileUri: attachment.fileUri,
        filename: attachment.filename,
        organizationId: "org-1",
      }),
    );
    expect(mocks.mutation).toHaveBeenCalledWith("sendSessionMessage", {
      sessionId: "session-1",
      text: "<trace:input-response />",
      attachmentKeys: ["org/org-1/wireframe.png"],
      interactionMode: "plan",
      clientMutationId: "mutation-1",
    });
    expect(mocks.reconcile).toHaveBeenCalledWith("session-1", "optimistic-event", "event-1");
    expect(onAttachmentsUploaded).toHaveBeenCalledWith(uploaded);
  });

  it("removes the optimistic response when sending fails", async () => {
    mocks.mutation.mockReturnValue({
      toPromise: async () => ({ error: new Error("offline") }),
    });

    await expect(
      submitQuestionResponse({
        sessionId: "session-1",
        text: "answer",
        attachments: [],
        organizationId: null,
      }),
    ).rejects.toThrow("offline");

    expect(mocks.remove).toHaveBeenCalledWith("session-1", "optimistic-event");
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("fails before creating a response when an upload has no organization", async () => {
    await expect(
      submitQuestionResponse({
        sessionId: "session-1",
        text: "answer",
        attachments: [attachment],
        organizationId: null,
      }),
    ).rejects.toThrow("No active organization");

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
