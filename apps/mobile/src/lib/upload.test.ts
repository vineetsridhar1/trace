import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadFile } from "./upload";

const fileSystemMock = vi.hoisted(() => ({
  bytesByUri: new Map<string, Uint8Array>(),
  sizeByUri: new Map<string, number>(),
}));

vi.mock("expo-file-system", () => ({
  File: class MockFile {
    readonly uri: string;

    constructor(uri: string) {
      this.uri = uri;
    }

    get size() {
      return fileSystemMock.sizeByUri.get(this.uri) ?? 0;
    }

    async bytes() {
      return fileSystemMock.bytesByUri.get(this.uri) ?? new Uint8Array();
    }
  },
}));

vi.mock("@trace/client-core", () => ({
  getAuthHeaders: () => ({ Authorization: "Bearer token-1" }),
}));

vi.mock("./connection-target", () => ({
  getActiveApiUrl: () => "https://trace.example",
}));

interface MockFormDataEntry {
  name: string;
  value: unknown;
  filename?: string;
}

class MockFormData {
  readonly entries: MockFormDataEntry[] = [];

  append(name: string, value: unknown, filename?: string): void {
    this.entries.push({ name, value, filename });
  }
}

const originalFormData = globalThis.FormData;
const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("uploadFile", () => {
  beforeEach(() => {
    fileSystemMock.bytesByUri.clear();
    fileSystemMock.sizeByUri.clear();
    fetchMock.mockReset();
    globalThis.FormData = MockFormData as unknown as typeof FormData;
    globalThis.fetch = fetchMock;
  });

  afterAll(() => {
    globalThis.FormData = originalFormData;
  });

  it("uploads picker files to S3 POST targets as React Native file parts", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (String(input) === "https://trace.example/uploads/presign") {
        return jsonResponse({
          key: "uploads/org-1/report.pdf",
          uploadTarget: {
            method: "POST",
            url: "https://bucket.example",
            fields: {
              "Content-Type": "application/pdf",
              key: "uploads/org-1/report.pdf",
              policy: "policy",
            },
          },
        });
      }
      return new Response(null, { status: 204 });
    });

    await expect(
      uploadFile({
        fileUri: "file:///tmp/report.pdf",
        filename: "report.pdf",
        mimeType: "application/pdf",
        size: 1234,
        organizationId: "org-1",
      }),
    ).resolves.toBe("uploads/org-1/report.pdf");

    const presignInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(presignInit.body))).toMatchObject({
      filename: "report.pdf",
      contentType: "application/pdf",
      contentLength: 1234,
      organizationId: "org-1",
    });

    const uploadInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const formData = uploadInit.body as unknown as MockFormData;
    expect(formData.entries).toContainEqual({
      name: "file",
      value: {
        uri: "file:///tmp/report.pdf",
        name: "report.pdf",
        type: "application/pdf",
      },
      filename: undefined,
    });
  });

  it("rejects unreadable zero-byte file URIs before creating an upload URL", async () => {
    await expect(
      uploadFile({
        fileUri: "file:///tmp/empty.txt",
        filename: "empty.txt",
        mimeType: "text/plain",
        organizationId: "org-1",
      }),
    ).rejects.toThrow("Could not read picked file");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
