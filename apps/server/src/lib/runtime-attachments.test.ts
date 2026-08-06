import { describe, expect, it } from "vitest";
import { rewriteRuntimeAttachmentUrl } from "./runtime-attachments.js";

describe("rewriteRuntimeAttachmentUrl", () => {
  it("rewrites local storage URLs for cloud containers", () => {
    expect(
      rewriteRuntimeAttachmentUrl("http://localhost:4000/uploads/local/get/token", {
        hosting: "cloud",
        storageMode: "local",
        cloudStoragePublicUrl: "http://host.docker.internal:4000",
      }),
    ).toBe("http://host.docker.internal:4000/uploads/local/get/token");
  });

  it("leaves browser URLs unchanged for local sessions", () => {
    const url = "http://localhost:4000/uploads/local/get/token";
    expect(
      rewriteRuntimeAttachmentUrl(url, {
        hosting: "local",
        storageMode: "local",
        cloudStoragePublicUrl: "http://host.docker.internal:4000",
      }),
    ).toBe(url);
  });

  it("does not rewrite object-storage URLs", () => {
    const url = "https://files.example.com/uploads/image.png";
    expect(
      rewriteRuntimeAttachmentUrl(url, {
        hosting: "cloud",
        storageMode: "s3",
        cloudStoragePublicUrl: "http://host.docker.internal:4000",
      }),
    ).toBe(url);
  });

  it("fails when cloud storage reachability is not configured", () => {
    expect(() =>
      rewriteRuntimeAttachmentUrl("http://localhost:4000/uploads/local/get/token", {
        hosting: "cloud",
        storageMode: "local",
        cloudStoragePublicUrl: undefined,
      }),
    ).toThrow("TRACE_CLOUD_STORAGE_PUBLIC_URL is required");
  });
});
