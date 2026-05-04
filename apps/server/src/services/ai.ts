import type {
  LLMAdapter,
  LLMResponse,
  LLMStreamEvent,
  LLMMessage,
  LLMToolDefinition,
  LLMToolUseContent,
  LLMToolResultContent,
} from "@trace/shared";
import { createLLMAdapter, providerForModel } from "../lib/llm/index.js";
import type { LLMProvider } from "../lib/llm/index.js";
import { apiTokenService } from "./api-token.js";

const MAX_CACHED_ADAPTERS = 200;

interface AIRequestParams {
  organizationId: string;
  userId: string;
  model: string;
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

type ServerAIRequestParams = Omit<AIRequestParams, "userId">;

interface ToolLoopParams extends AIRequestParams {
  executeToolCall: (name: string, input: Record<string, unknown>) => Promise<string>;
  maxIterations?: number;
}

type AdapterCacheKey = `${string}:${LLMProvider}`;

function getServerApiKey(provider: LLMProvider): string | null {
  const value =
    provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  const trimmed = value?.trim();
  return trimmed || null;
}

class AIService {
  private adapterCache = new Map<AdapterCacheKey, LLMAdapter>();

  async getAdapter(userId: string, model: string): Promise<LLMAdapter> {
    const provider = providerForModel(model);
    const cacheKey: AdapterCacheKey = `${userId}:${provider}`;

    const cached = this.adapterCache.get(cacheKey);
    if (cached) return cached;

    const tokens = await apiTokenService.getDecryptedTokens(userId);
    const apiKey = tokens[provider];

    if (!apiKey) {
      throw new Error(`No ${provider} API key configured. Please add your API key in settings.`);
    }

    const adapter = createLLMAdapter({ provider, apiKey });

    // Evict oldest entry if cache is full
    if (this.adapterCache.size >= MAX_CACHED_ADAPTERS) {
      const oldest = this.adapterCache.keys().next().value;
      if (oldest !== undefined) {
        this.adapterCache.delete(oldest);
      }
    }

    this.adapterCache.set(cacheKey, adapter);
    return adapter;
  }

  async getServerAdapter(model: string): Promise<LLMAdapter> {
    const provider = providerForModel(model);
    const cacheKey: AdapterCacheKey = `__server__:${provider}`;

    const cached = this.adapterCache.get(cacheKey);
    if (cached) return cached;

    const apiKey = getServerApiKey(provider);
    if (!apiKey) {
      throw new Error(`No ${provider} API key configured on the server.`);
    }

    const adapter = createLLMAdapter({ provider, apiKey });

    if (this.adapterCache.size >= MAX_CACHED_ADAPTERS) {
      const oldest = this.adapterCache.keys().next().value;
      if (oldest !== undefined) {
        this.adapterCache.delete(oldest);
      }
    }

    this.adapterCache.set(cacheKey, adapter);
    return adapter;
  }

  invalidateAdapter(userId: string, provider: LLMProvider): void {
    this.adapterCache.delete(`${userId}:${provider}`);
  }

  async complete(params: AIRequestParams): Promise<LLMResponse> {
    const adapter = await this.getAdapter(params.userId, params.model);
    return adapter.complete({
      model: params.model,
      messages: params.messages,
      tools: params.tools,
      system: params.system,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
    });
  }

  async completeWithServerCredentials(params: ServerAIRequestParams): Promise<LLMResponse> {
    const adapter = await this.getServerAdapter(params.model);
    return adapter.complete({
      model: params.model,
      messages: params.messages,
      tools: params.tools,
      system: params.system,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
    });
  }

  async *stream(params: AIRequestParams): AsyncIterable<LLMStreamEvent> {
    const adapter = await this.getAdapter(params.userId, params.model);
    yield* adapter.stream({
      model: params.model,
      messages: params.messages,
      tools: params.tools,
      system: params.system,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
    });
  }

  async runToolLoop(params: ToolLoopParams): Promise<LLMResponse> {
    const { executeToolCall, maxIterations = 10, ...requestParams } = params;
    const messages = [...requestParams.messages];
    const adapter = await this.getAdapter(requestParams.userId, requestParams.model);
    let iterations = 0;

    while (iterations < maxIterations) {
      const response = await adapter.complete({
        model: requestParams.model,
        messages,
        tools: requestParams.tools,
        system: requestParams.system,
        maxTokens: requestParams.maxTokens,
        temperature: requestParams.temperature,
      });

      if (response.stopReason !== "tool_use") {
        return response;
      }

      // Add assistant response to messages
      messages.push({ role: "assistant", content: response.content });

      // Execute tool calls and collect results
      const toolUseBlocks = response.content.filter(
        (b): b is LLMToolUseContent => b.type === "tool_use",
      );

      const toolResults: LLMToolResultContent[] = await Promise.all(
        toolUseBlocks.map(async (block: LLMToolUseContent) => {
          try {
            const result = await executeToolCall(block.name, block.input);
            return {
              type: "tool_result" as const,
              toolUseId: block.id,
              content: result,
            };
          } catch (err) {
            return {
              type: "tool_result" as const,
              toolUseId: block.id,
              content: err instanceof Error ? err.message : "Tool execution failed",
              isError: true,
            };
          }
        }),
      );

      messages.push({ role: "tool", content: toolResults });
      iterations++;
    }

    // Max iterations reached — do one final call without tools
    return adapter.complete({
      model: requestParams.model,
      messages,
      system: requestParams.system,
      maxTokens: requestParams.maxTokens,
      temperature: requestParams.temperature,
    });
  }
}

export const aiService = new AIService();
