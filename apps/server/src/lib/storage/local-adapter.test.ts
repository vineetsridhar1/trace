import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalStorageAdapter } from "./local-adapter.js";

afterEach(() => vi.unstubAllEnvs());

describe("LocalStorageAdapter public URLs", () => {
  it("uses the Trace server public URL for remote bridge uploads", async () => {
    vi.stubEnv("STORAGE_PUBLIC_URL", "");
    vi.stubEnv("TRACE_SERVER_PUBLIC_URL", "https://trace.example.test/");

    const target = await new LocalStorageAdapter().getUploadTarget(
      "pdf-exports/document.pdf",
      "application/pdf",
      1024,
    );

    expect(target.url).toMatch(/^https:\/\/trace\.example\.test\/uploads\/local\/put\//);
  });

  it("prefers an explicit storage public URL", async () => {
    vi.stubEnv("STORAGE_PUBLIC_URL", "https://storage.example.test/");
    vi.stubEnv("TRACE_SERVER_PUBLIC_URL", "https://trace.example.test/");

    const target = await new LocalStorageAdapter().getUploadTarget(
      "pdf-exports/document.pdf",
      "application/pdf",
      1024,
    );

    expect(target.url).toMatch(/^https:\/\/storage\.example\.test\/uploads\/local\/put\//);
  });
});
