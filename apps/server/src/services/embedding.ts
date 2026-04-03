/**
 * Embedding Service — provider-agnostic embedding client for semantic search.
 *
 * Abstracts the embedding provider (Anthropic, OpenAI, etc.) behind a simple
 * interface. Uses the configured LLM adapter's embedding endpoint.
 *
 * Only embeds DerivedMemory.content and EntitySummary.content — NOT raw events.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  inputTokens: number;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  model: string;
  totalInputTokens: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class EmbeddingService {
  /**
   * Embed a single text string.
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const result = await this.embedBatch([text]);
    return {
      embedding: result.embeddings[0],
      model: result.model,
      inputTokens: result.totalInputTokens,
    };
  }

  /**
   * Embed a batch of text strings.
   *
   * Uses OpenAI-compatible embedding API. The provider is configured via
   * environment variables.
   */
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      return { embeddings: [], model: EMBEDDING_MODEL, totalInputTokens: 0 };
    }

    // Chunk into batches
    const allEmbeddings: number[][] = [];
    let totalTokens = 0;

    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const batch = texts.slice(i, i + MAX_BATCH_SIZE);
      const result = await this.callEmbeddingApi(batch);
      allEmbeddings.push(...result.embeddings);
      totalTokens += result.inputTokens;
    }

    return {
      embeddings: allEmbeddings,
      model: EMBEDDING_MODEL,
      totalInputTokens: totalTokens,
    };
  }

  private async callEmbeddingApi(
    texts: string[],
  ): Promise<{ embeddings: number[][]; inputTokens: number }> {
    const apiKey = process.env.OPENAI_API_KEY ?? process.env.EMBEDDING_API_KEY;
    const baseUrl = process.env.EMBEDDING_BASE_URL ?? "https://api.openai.com/v1";

    if (!apiKey) {
      // Fallback: return zero vectors if no API key configured
      return {
        embeddings: texts.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0)),
        inputTokens: 0,
      };
    }

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
      usage: { prompt_tokens: number };
    };

    // Sort by index to preserve order
    const sorted = data.data.sort((a, b) => a.index - b.index);

    return {
      embeddings: sorted.map((d) => d.embedding),
      inputTokens: data.usage.prompt_tokens,
    };
  }
}

export const embeddingService = new EmbeddingService();
