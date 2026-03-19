import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMAdapter,
  LLMRequestOptions,
  LLMResponse,
  LLMStreamEvent,
  LLMContentBlock,
  LLMMessage,
} from "@trace/shared";

type AnthropicMessage = Anthropic.MessageParam;
type AnthropicContent = Anthropic.ContentBlockParam;
type AnthropicTool = Anthropic.Tool;

function toAnthropicContent(
  content: string | LLMContentBlock[]
): string | AnthropicContent[] {
  if (typeof content === "string") return content;

  return content.map((block): AnthropicContent => {
    switch (block.type) {
      case "text":
        return { type: "text", text: block.text };
      case "image":
        if (block.source.type === "base64") {
          return {
            type: "image",
            source: {
              type: "base64",
              media_type: block.source.mediaType as
                | "image/jpeg"
                | "image/png"
                | "image/gif"
                | "image/webp",
              data: block.source.data,
            },
          };
        }
        return {
          type: "image",
          source: { type: "url", url: block.source.url },
        };
      case "tool_use":
        return {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input,
        };
      case "tool_result":
        return {
          type: "tool_result",
          tool_use_id: block.toolUseId,
          content: block.content,
          is_error: block.isError,
        };
    }
  });
}

function toAnthropicMessages(messages: LLMMessage[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];

  for (const m of messages) {
    if (m.role === "system") continue;

    // Anthropic has no "tool" role — tool results are content blocks in user messages
    if (m.role === "tool") {
      const toolResultBlocks: AnthropicContent[] = [];
      if (typeof m.content !== "string") {
        for (const block of m.content) {
          if (block.type === "tool_result") {
            toolResultBlocks.push({
              type: "tool_result",
              tool_use_id: block.toolUseId,
              content: block.content,
              is_error: block.isError,
            });
          }
        }
      }
      if (toolResultBlocks.length) {
        result.push({ role: "user", content: toolResultBlocks });
      }
      continue;
    }

    result.push({
      role: m.role as "user" | "assistant",
      content: toAnthropicContent(m.content),
    });
  }

  return result;
}

function toAnthropicTools(
  tools: LLMRequestOptions["tools"]
): AnthropicTool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
  }));
}

function fromAnthropicContent(
  blocks: Anthropic.ContentBlock[]
): LLMContentBlock[] {
  const result: LLMContentBlock[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      result.push({ type: "text", text: block.text });
    } else if (block.type === "tool_use") {
      result.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
    // Skip thinking blocks, server_tool_use, etc.
  }
  return result;
}

function fromAnthropicStopReason(
  reason: Anthropic.Message["stop_reason"]
): LLMResponse["stopReason"] {
  switch (reason) {
    case "end_turn":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "stop_sequence":
      return "stop_sequence";
    default:
      return "end_turn";
  }
}

export class AnthropicAdapter implements LLMAdapter {
  readonly provider = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      messages: toAnthropicMessages(options.messages),
      system: options.system,
      tools: toAnthropicTools(options.tools),
      temperature: options.temperature,
      stop_sequences: options.stopSequences,
    });

    return {
      content: fromAnthropicContent(response.content),
      stopReason: fromAnthropicStopReason(response.stop_reason),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
    };
  }

  async *stream(options: LLMRequestOptions): AsyncIterable<LLMStreamEvent> {
    const stream = this.client.messages.stream({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      messages: toAnthropicMessages(options.messages),
      system: options.system,
      tools: toAnthropicTools(options.tools),
      temperature: options.temperature,
      stop_sequences: options.stopSequences,
    });

    for await (const event of stream) {
      switch (event.type) {
        case "content_block_start":
          if (event.content_block.type === "tool_use") {
            yield {
              type: "tool_use_start",
              id: event.content_block.id,
              name: event.content_block.name,
            };
          }
          break;

        case "content_block_delta":
          if (event.delta.type === "text_delta") {
            yield { type: "text_delta", text: event.delta.text };
          } else if (event.delta.type === "input_json_delta") {
            yield {
              type: "tool_use_input_delta",
              inputDelta: event.delta.partial_json,
            };
          }
          break;

        case "message_stop": {
          const finalMessage = await stream.finalMessage();
          yield {
            type: "complete",
            response: {
              content: fromAnthropicContent(finalMessage.content),
              stopReason: fromAnthropicStopReason(finalMessage.stop_reason),
              usage: {
                inputTokens: finalMessage.usage.input_tokens,
                outputTokens: finalMessage.usage.output_tokens,
              },
              model: finalMessage.model,
            },
          };
          break;
        }
      }
    }
  }
}
