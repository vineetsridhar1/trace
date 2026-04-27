import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api-token.js", () => ({
  apiTokenService: {
    getDecryptedTokens: vi.fn(),
  },
}));

vi.mock("../lib/llm/index.js", () => ({
  createLLMAdapter: vi.fn(),
  providerForModel: vi.fn(),
}));

import { apiTokenService } from "./api-token.js";
import { createLLMAdapter, providerForModel } from "../lib/llm/index.js";
import { aiService } from "./ai.js";

const apiTokenServiceMock = apiTokenService as any;
const createLLMAdapterMock = createLLMAdapter as ReturnType<typeof vi.fn>;
const providerForModelMock = providerForModel as ReturnType<typeof vi.fn>;

// Helper to access the private adapter cache for assertions.
// This is necessary because cache behavior (eviction, invalidation) can only
// be verified by inspecting internal state — there's no public API for it.
function getCache(): Map<string, unknown> {
  return (aiService as Record<string, unknown>).adapterCache as Map<string, unknown>;
}

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return {
    complete: vi.fn(),
    stream: vi.fn(),
    ...overrides,
  };
}

describe("AIService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the adapter cache between tests
    getCache().clear();
  });

  describe("getAdapter", () => {
    it("creates and caches an adapter", async () => {
      providerForModelMock.mockReturnValue("anthropic");
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({
        anthropic: "sk-test-key",
      });
      const adapter = makeAdapter();
      createLLMAdapterMock.mockReturnValueOnce(adapter);

      const result = await aiService.getAdapter("user-1", "claude-sonnet-4-20250514");

      expect(result).toBe(adapter);
      expect(providerForModelMock).toHaveBeenCalledWith("claude-sonnet-4-20250514");
      expect(createLLMAdapterMock).toHaveBeenCalledWith({
        provider: "anthropic",
        apiKey: "sk-test-key",
      });
    });

    it("returns cached adapter on subsequent calls", async () => {
      providerForModelMock.mockReturnValue("anthropic");
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({
        anthropic: "sk-test-key",
      });
      const adapter = makeAdapter();
      createLLMAdapterMock.mockReturnValueOnce(adapter);

      const first = await aiService.getAdapter("user-1", "claude-sonnet-4-20250514");
      const second = await aiService.getAdapter("user-1", "claude-sonnet-4-20250514");

      expect(first).toBe(second);
      expect(createLLMAdapterMock).toHaveBeenCalledTimes(1);
    });

    it("creates separate adapters for different users", async () => {
      providerForModelMock.mockReturnValue("anthropic");
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({ anthropic: "key-1" });
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({ anthropic: "key-2" });
      const adapter1 = makeAdapter();
      const adapter2 = makeAdapter();
      createLLMAdapterMock.mockReturnValueOnce(adapter1).mockReturnValueOnce(adapter2);

      const first = await aiService.getAdapter("user-1", "claude-sonnet-4-20250514");
      const second = await aiService.getAdapter("user-2", "claude-sonnet-4-20250514");

      expect(first).toBe(adapter1);
      expect(second).toBe(adapter2);
      expect(createLLMAdapterMock).toHaveBeenCalledTimes(2);
    });

    it("creates separate adapters for different providers", async () => {
      providerForModelMock.mockReturnValueOnce("anthropic").mockReturnValueOnce("openai");
      apiTokenServiceMock.getDecryptedTokens
        .mockResolvedValueOnce({ anthropic: "key-a" })
        .mockResolvedValueOnce({ openai: "key-o" });
      const adapter1 = makeAdapter();
      const adapter2 = makeAdapter();
      createLLMAdapterMock.mockReturnValueOnce(adapter1).mockReturnValueOnce(adapter2);

      const first = await aiService.getAdapter("user-1", "claude-sonnet-4-20250514");
      const second = await aiService.getAdapter("user-1", "gpt-4");

      expect(first).toBe(adapter1);
      expect(second).toBe(adapter2);
    });

    it("throws when no API key is configured", async () => {
      providerForModelMock.mockReturnValue("anthropic");
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({});

      await expect(aiService.getAdapter("user-1", "claude-sonnet-4-20250514")).rejects.toThrow(
        "No anthropic API key configured",
      );
    });

    it("evicts oldest entry when cache is full", async () => {
      providerForModelMock.mockReturnValue("anthropic");

      // Fill cache to MAX_CACHED_ADAPTERS (200)
      for (let i = 0; i < 200; i++) {
        apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({ anthropic: `key-${i}` });
        createLLMAdapterMock.mockReturnValueOnce(makeAdapter());
        await aiService.getAdapter(`user-${i}`, "claude-sonnet-4-20250514");
      }

      expect(getCache().size).toBe(200);

      // Add one more — should evict the oldest
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({ anthropic: "key-new" });
      createLLMAdapterMock.mockReturnValueOnce(makeAdapter());
      await aiService.getAdapter("user-new", "claude-sonnet-4-20250514");

      expect(getCache().size).toBe(200);
      // The oldest entry (user-0) should have been evicted
      expect(getCache().has("user-0:anthropic")).toBe(false);
      expect(getCache().has("user-new:anthropic")).toBe(true);
    });
  });

  describe("invalidateAdapter", () => {
    it("removes adapter from cache", async () => {
      providerForModelMock.mockReturnValue("anthropic");
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({ anthropic: "key" });
      createLLMAdapterMock.mockReturnValueOnce(makeAdapter());

      await aiService.getAdapter("user-1", "claude-sonnet-4-20250514");
      expect(getCache().has("user-1:anthropic")).toBe(true);

      aiService.invalidateAdapter("user-1", "anthropic" as any);
      expect(getCache().has("user-1:anthropic")).toBe(false);
    });

    it("is a no-op when adapter not cached", () => {
      // Should not throw
      aiService.invalidateAdapter("user-missing", "anthropic" as any);
    });
  });

  describe("complete", () => {
    it("delegates to the adapter", async () => {
      providerForModelMock.mockReturnValue("anthropic");
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({ anthropic: "key" });
      const adapter = makeAdapter();
      adapter.complete.mockResolvedValueOnce({
        content: [{ type: "text", text: "Hello" }],
        stopReason: "end_turn",
      });
      createLLMAdapterMock.mockReturnValueOnce(adapter);

      const result = await aiService.complete({
        organizationId: "org-1",
        userId: "user-1",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hi" }],
        system: "You are helpful",
        maxTokens: 1024,
        temperature: 0.7,
      });

      expect(result).toEqual({
        content: [{ type: "text", text: "Hello" }],
        stopReason: "end_turn",
      });
      expect(adapter.complete).toHaveBeenCalledWith({
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hi" }],
        tools: undefined,
        system: "You are helpful",
        maxTokens: 1024,
        temperature: 0.7,
      });
    });

    it("passes tools when provided", async () => {
      providerForModelMock.mockReturnValue("anthropic");
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({ anthropic: "key" });
      const adapter = makeAdapter();
      adapter.complete.mockResolvedValueOnce({ content: [], stopReason: "end_turn" });
      createLLMAdapterMock.mockReturnValueOnce(adapter);

      const tools = [{ name: "get_weather", description: "Get weather", inputSchema: {} }];
      await aiService.complete({
        organizationId: "org-1",
        userId: "user-1",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Weather?" }],
        tools: tools as any,
      });

      expect(adapter.complete).toHaveBeenCalledWith(expect.objectContaining({ tools }));
    });
  });

  describe("stream", () => {
    it("yields events from adapter stream", async () => {
      providerForModelMock.mockReturnValue("anthropic");
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({ anthropic: "key" });
      const events = [
        { type: "text_delta", text: "Hello" },
        { type: "text_delta", text: " world" },
      ];
      const adapter = makeAdapter({
        stream: vi.fn().mockReturnValue(
          (async function* () {
            for (const e of events) yield e;
          })(),
        ),
      });
      createLLMAdapterMock.mockReturnValueOnce(adapter);

      const collected: unknown[] = [];
      for await (const event of aiService.stream({
        organizationId: "org-1",
        userId: "user-1",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hi" }],
      })) {
        collected.push(event);
      }

      expect(collected).toEqual(events);
    });
  });

  describe("runToolLoop", () => {
    it("returns immediately when no tool use in response", async () => {
      providerForModelMock.mockReturnValue("anthropic");
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({ anthropic: "key" });
      const adapter = makeAdapter();
      adapter.complete.mockResolvedValueOnce({
        content: [{ type: "text", text: "Done" }],
        stopReason: "end_turn",
      });
      createLLMAdapterMock.mockReturnValueOnce(adapter);

      const result = await aiService.runToolLoop({
        organizationId: "org-1",
        userId: "user-1",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Do something" }],
        executeToolCall: vi.fn(),
      });

      expect(result.content).toEqual([{ type: "text", text: "Done" }]);
      expect(adapter.complete).toHaveBeenCalledTimes(1);
    });

    it("executes tool calls and loops", async () => {
      providerForModelMock.mockReturnValue("anthropic");
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({ anthropic: "key" });
      const adapter = makeAdapter();

      // First call: tool use
      adapter.complete.mockResolvedValueOnce({
        content: [
          { type: "text", text: "Let me check" },
          { type: "tool_use", id: "tool-1", name: "get_weather", input: { city: "NYC" } },
        ],
        stopReason: "tool_use",
      });

      // Second call: final response
      adapter.complete.mockResolvedValueOnce({
        content: [{ type: "text", text: "It's sunny in NYC" }],
        stopReason: "end_turn",
      });

      createLLMAdapterMock.mockReturnValueOnce(adapter);

      const executeToolCall = vi.fn().mockResolvedValueOnce("Sunny, 72°F");

      const result = await aiService.runToolLoop({
        organizationId: "org-1",
        userId: "user-1",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "What's the weather?" }],
        tools: [{ name: "get_weather", description: "Get weather", inputSchema: {} }] as any,
        executeToolCall,
      });

      expect(result.content).toEqual([{ type: "text", text: "It's sunny in NYC" }]);
      expect(executeToolCall).toHaveBeenCalledWith("get_weather", { city: "NYC" });
      expect(adapter.complete).toHaveBeenCalledTimes(2);

      // Verify the second call includes the tool result
      const secondCallMessages = adapter.complete.mock.calls[1][0].messages;
      expect(secondCallMessages).toHaveLength(3); // original + assistant + tool result
      expect(secondCallMessages[2]).toEqual({
        role: "tool",
        content: [
          {
            type: "tool_result",
            toolUseId: "tool-1",
            content: "Sunny, 72°F",
          },
        ],
      });
    });

    it("handles tool execution errors gracefully", async () => {
      providerForModelMock.mockReturnValue("anthropic");
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({ anthropic: "key" });
      const adapter = makeAdapter();

      adapter.complete
        .mockResolvedValueOnce({
          content: [{ type: "tool_use", id: "tool-1", name: "dangerous_tool", input: {} }],
          stopReason: "tool_use",
        })
        .mockResolvedValueOnce({
          content: [{ type: "text", text: "Tool failed, sorry" }],
          stopReason: "end_turn",
        });

      createLLMAdapterMock.mockReturnValueOnce(adapter);

      const executeToolCall = vi.fn().mockRejectedValueOnce(new Error("Permission denied"));

      const result = await aiService.runToolLoop({
        organizationId: "org-1",
        userId: "user-1",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Do it" }],
        executeToolCall,
      });

      expect(result.content).toEqual([{ type: "text", text: "Tool failed, sorry" }]);

      // Verify error was captured in tool result
      const secondCallMessages = adapter.complete.mock.calls[1][0].messages;
      const toolResultMsg = secondCallMessages[2];
      expect(toolResultMsg.content[0].isError).toBe(true);
      expect(toolResultMsg.content[0].content).toBe("Permission denied");
    });

    it("handles non-Error thrown from tool execution", async () => {
      providerForModelMock.mockReturnValue("anthropic");
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({ anthropic: "key" });
      const adapter = makeAdapter();

      adapter.complete
        .mockResolvedValueOnce({
          content: [{ type: "tool_use", id: "tool-1", name: "tool", input: {} }],
          stopReason: "tool_use",
        })
        .mockResolvedValueOnce({
          content: [{ type: "text", text: "ok" }],
          stopReason: "end_turn",
        });

      createLLMAdapterMock.mockReturnValueOnce(adapter);

      const executeToolCall = vi.fn().mockRejectedValueOnce("string error");

      await aiService.runToolLoop({
        organizationId: "org-1",
        userId: "user-1",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Do it" }],
        executeToolCall,
      });

      const secondCallMessages = adapter.complete.mock.calls[1][0].messages;
      expect(secondCallMessages[2].content[0].content).toBe("Tool execution failed");
    });

    it("stops after maxIterations and makes a final call without tools", async () => {
      providerForModelMock.mockReturnValue("anthropic");
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({ anthropic: "key" });
      const adapter = makeAdapter();

      // Always return tool_use to force maxIterations
      adapter.complete.mockResolvedValue({
        content: [{ type: "tool_use", id: "tool-1", name: "loop_tool", input: {} }],
        stopReason: "tool_use",
      });

      // Override last call for the final response (without tools)
      const finalResponse = {
        content: [{ type: "text", text: "Gave up" }],
        stopReason: "end_turn",
      };

      createLLMAdapterMock.mockReturnValueOnce(adapter);

      const executeToolCall = vi.fn().mockResolvedValue("result");

      // Set maxIterations to 2
      // After 2 iterations, a final call without tools is made
      // That's 2 tool_use calls + 1 final call = 3 calls
      // We need the 3rd call to return a non-tool response
      let callCount = 0;
      adapter.complete.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve({
            content: [{ type: "tool_use", id: `tool-${callCount}`, name: "loop_tool", input: {} }],
            stopReason: "tool_use",
          });
        }
        return Promise.resolve(finalResponse);
      });

      const result = await aiService.runToolLoop({
        organizationId: "org-1",
        userId: "user-1",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Loop" }],
        tools: [{ name: "loop_tool", description: "Loops", inputSchema: {} }] as any,
        executeToolCall,
        maxIterations: 2,
      });

      expect(result).toEqual(finalResponse);
      expect(adapter.complete).toHaveBeenCalledTimes(3); // 2 iterations + 1 final
      expect(executeToolCall).toHaveBeenCalledTimes(2);

      // Final call should not include tools
      const finalCall = adapter.complete.mock.calls[2][0];
      expect(finalCall.tools).toBeUndefined();
    });

    it("executes multiple tool calls in parallel", async () => {
      providerForModelMock.mockReturnValue("anthropic");
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({ anthropic: "key" });
      const adapter = makeAdapter();

      adapter.complete
        .mockResolvedValueOnce({
          content: [
            { type: "tool_use", id: "t1", name: "tool_a", input: { q: "a" } },
            { type: "tool_use", id: "t2", name: "tool_b", input: { q: "b" } },
          ],
          stopReason: "tool_use",
        })
        .mockResolvedValueOnce({
          content: [{ type: "text", text: "Combined results" }],
          stopReason: "end_turn",
        });

      createLLMAdapterMock.mockReturnValueOnce(adapter);

      const executeToolCall = vi
        .fn()
        .mockImplementation((name: string) =>
          Promise.resolve(name === "tool_a" ? "result_a" : "result_b"),
        );

      const result = await aiService.runToolLoop({
        organizationId: "org-1",
        userId: "user-1",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Do both" }],
        executeToolCall,
      });

      expect(executeToolCall).toHaveBeenCalledTimes(2);
      expect(result.content).toEqual([{ type: "text", text: "Combined results" }]);

      // Verify both tool results were sent back
      const secondCallMessages = adapter.complete.mock.calls[1][0].messages;
      const toolResultMsg = secondCallMessages[2];
      expect(toolResultMsg.content).toHaveLength(2);
      expect(toolResultMsg.content[0].toolUseId).toBe("t1");
      expect(toolResultMsg.content[1].toolUseId).toBe("t2");
    });
  });
});
