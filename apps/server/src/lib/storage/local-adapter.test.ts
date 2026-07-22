import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalStorageAdapter } from "./local-adapter.js";
import { readFile } from "node:fs/promises";

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

describe("LocalStorageAdapter object lifecycle", () => {
  it("deletes stored objects idempotently", async () => {
    const adapter = new LocalStorageAdapter();
    await adapter.putObject("pdf/test.pdf", Buffer.from("pdf"));
    await expect(readFile(adapter.resolvePath("pdf/test.pdf"), "utf8")).resolves.toBe("pdf");
    await adapter.deleteObject("pdf/test.pdf");
    await adapter.deleteObject("pdf/test.pdf");
    await expect(readFile(adapter.resolvePath("pdf/test.pdf"), "utf8")).rejects.toThrow();
  });

  it("can enforce immutable server-owned object keys", async () => {
    const adapter = new LocalStorageAdapter();
    const key = `design-systems/test-${Date.now()}/package.tar.gz`;
    await adapter.putObject(key, Buffer.from("version-one"), "application/gzip", {
      ifAbsent: true,
    });
    await expect(
      adapter.putObject(key, Buffer.from("version-two"), "application/gzip", { ifAbsent: true }),
    ).rejects.toMatchObject({ code: "EEXIST" });
    await expect(adapter.getObject(key)).resolves.toEqual(Buffer.from("version-one"));
    await adapter.deleteObject(key);
  });
});
