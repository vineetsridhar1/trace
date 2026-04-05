import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddingService, EmbeddingUnavailableError } from "./embedding.js";

describe("EmbeddingService", () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalEmbeddingKey = process.env.EMBEDDING_API_KEY;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.EMBEDDING_API_KEY;
  });

  afterEach(() => {
    if (originalOpenAiKey) {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }

    if (originalEmbeddingKey) {
      process.env.EMBEDDING_API_KEY = originalEmbeddingKey;
    } else {
      delete process.env.EMBEDDING_API_KEY;
    }
    vi.restoreAllMocks();
  });

  it("reports whether embeddings are configured", () => {
    const service = new EmbeddingService();
    expect(service.isConfigured()).toBe(false);

    process.env.EMBEDDING_API_KEY = "test-key";
    expect(service.isConfigured()).toBe(true);
  });

  it("throws instead of returning fake zero vectors when no API key is configured", async () => {
    const service = new EmbeddingService();

    await expect(service.embedBatch(["hello world"])).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );
  });
});
