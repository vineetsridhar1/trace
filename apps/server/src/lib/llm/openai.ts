import OpenAI from "openai";
import type {
  LLMAdapter,
  LLMRequestOptions,
  LLMResponse,
  LLMStreamEvent,
  LLMContentBlock,
  LLMMessage,
  LLMToolDefinition,
} from "@trace/shared";

type ChatMessage = OpenAI.ChatCompletionMessageParam;
type ChatTool = OpenAI.ChatCompletionTool;

function toOpenAIMessages(
  messages: LLMMessage[],
  system?: string
): ChatMessage[] {
  const result: ChatMessage[] = [];

  if (system) {
    result.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    if (msg.role === "system") {
      result.push({ role: "system", content: contentToString(msg.content) });
      continue;
    }

    if (msg.role === "user") {
      result.push({ role: "user", content: contentToString(msg.content) });
      continue;
    }

    if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        result.push({ role: "assistant", content: msg.content });
        continue;
      }

      // Assistant messages may contain text + tool_use blocks
      const textParts = msg.content.filter((b) => b.type === "text");
      const toolUseParts = msg.content.filter((b) => b.type === "tool_use");

      const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
        role: "assistant",
        content: textParts.length
          ? textParts.map((b) => b.text).join("")
          : null,
      };

      if (toolUseParts.length) {
        assistantMsg.tool_calls = toolUseParts.map((b) => ({
          id: b.id,
          type: "function" as const,
          function: {
            name: b.name,
            arguments: JSON.stringify(b.input),
          },
        }));
      }

      result.push(assistantMsg);
      continue;
    }

    // tool role — map tool_result blocks
    if (msg.role === "tool") {
      if (typeof msg.content === "string") {
        // Shouldn't happen in practice, but handle gracefully
        continue;
      }
      for (const block of msg.content) {
        if (block.type === "tool_result") {
          result.push({
            role: "tool",
            tool_call_id: block.toolUseId,
            content: block.content,
          });
        }
      }
    }
  }

  return result;
}

function contentToString(content: string | LLMContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
}

function toOpenAITools(tools?: LLMToolDefinition[]): ChatTool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

function fromOpenAIResponse(
  response: OpenAI.ChatCompletion
): LLMResponse {
  const choice = response.choices[0];
  const content: LLMContentBlock[] = [];

  if (choice.message.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      if (tc.type === "function") {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        });
      }
    }
  }

  return {
    content,
    stopReason: fromOpenAIFinishReason(choice.finish_reason),
    usage: {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    },
    model: response.model,
  };
}

function fromOpenAIFinishReason(
  reason: string | null
): LLMResponse["stopReason"] {
  switch (reason) {
    case "stop":
      return "end_turn";
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "content_filter":
      return "end_turn";
    default:
      return "end_turn";
  }
}

export class OpenAIAdapter implements LLMAdapter {
  readonly provider = "openai";
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: options.model,
      messages: toOpenAIMessages(options.messages, options.system),
      tools: toOpenAITools(options.tools),
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      stop: options.stopSequences,
    });

    return fromOpenAIResponse(response);
  }

  async *stream(options: LLMRequestOptions): AsyncIterable<LLMStreamEvent> {
    const stream = await this.client.chat.completions.create({
      model: options.model,
      messages: toOpenAIMessages(options.messages, options.system),
      tools: toOpenAITools(options.tools),
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      stop: options.stopSequences,
      stream: true,
      stream_options: { include_usage: true },
    });

    // Track state for assembling the final response
    let textContent = "";
    const toolCalls: Map<
      number,
      { id: string; name: string; arguments: string }
    > = new Map();
    let model = options.model;
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (chunk.model) model = chunk.model;

      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }

      if (delta?.content) {
        textContent += delta.content;
        yield { type: "text_delta", text: delta.content };
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCalls.get(tc.index);
          if (!existing) {
            const id = tc.id ?? "";
            const name = tc.function?.name ?? "";
            toolCalls.set(tc.index, { id, name, arguments: "" });
            yield { type: "tool_use_start", id, name };
          } else {
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
              yield {
                type: "tool_use_input_delta",
                inputDelta: tc.function.arguments,
              };
            }
          }
        }
      }

      // Final chunk has finish_reason
      if (chunk.choices[0]?.finish_reason) {
        const content: LLMContentBlock[] = [];
        if (textContent) {
          content.push({ type: "text", text: textContent });
        }
        for (const tc of toolCalls.values()) {
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: JSON.parse(tc.arguments || "{}") as Record<string, unknown>,
          });
        }

        yield {
          type: "complete",
          response: {
            content,
            stopReason: fromOpenAIFinishReason(chunk.choices[0].finish_reason),
            usage: { inputTokens, outputTokens },
            model,
          },
        };
      }
    }
  }
}
