import OpenAI from "openai";
import type {
  LLMAdapter,
  LLMAssistantContentBlock,
  LLMProvider,
  LLMRequestOptions,
  LLMResponse,
  LLMStreamError,
  LLMStreamEvent,
  LLMMessage,
  LLMSystemMessage,
  LLMToolDefinition,
  LLMToolUseContent,
  LLMUserMessage,
} from "@trace/shared";

type ChatMessage = OpenAI.ChatCompletionMessageParam;
type ChatTool = OpenAI.ChatCompletionTool;
type ChatContentPart = OpenAI.ChatCompletionContentPart;
type ChatCompletionRequest = OpenAI.ChatCompletionCreateParamsNonStreaming;
type ChatCompletionStreamRequest = OpenAI.ChatCompletionCreateParamsStreaming;

function supportsOpenAIStopSequences(model: string): boolean {
  return !/^(o3|o4)(?:[-.]|$)/i.test(model);
}

function buildOpenAIBaseRequest(options: LLMRequestOptions): Omit<ChatCompletionRequest, "stream"> {
  if (options.stopSequences?.length && !supportsOpenAIStopSequences(options.model)) {
    throw new Error(`Stop sequences are not supported for OpenAI model "${options.model}".`);
  }

  return {
    model: options.model,
    messages: toOpenAIMessages(options.messages, options.system),
    tools: toOpenAITools(options.tools),
    max_completion_tokens: options.maxTokens,
    temperature: options.temperature,
    stop: options.stopSequences,
  };
}

function toStreamError(error: unknown): LLMStreamError {
  return {
    type: "error",
    error: error instanceof Error ? error : new Error("OpenAI stream failed"),
  };
}

function toOpenAIUserContent(content: LLMUserMessage["content"]): string | ChatContentPart[] {
  if (typeof content === "string") return content;

  const parts: ChatContentPart[] = [];
  for (const block of content) {
    switch (block.type) {
      case "text":
        parts.push({ type: "text", text: block.text });
        break;
      case "image": {
        const url =
          block.source.type === "url"
            ? block.source.url
            : `data:${block.source.mediaType};base64,${block.source.data}`;
        parts.push({ type: "image_url", image_url: { url } });
        break;
      }
      default:
        throw new Error(`Unsupported OpenAI user content block type "${block.type}".`);
    }
  }
  return parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts;
}

function contentToString(content: LLMSystemMessage["content"]): string {
  if (typeof content === "string") return content;
  return content.map((b) => b.text).join("");
}

function toOpenAIMessages(messages: LLMMessage[], system?: string): ChatMessage[] {
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
      result.push({ role: "user", content: toOpenAIUserContent(msg.content) });
      continue;
    }

    if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        result.push({ role: "assistant", content: msg.content });
        continue;
      }

      const textParts: string[] = [];
      const toolUseParts: LLMToolUseContent[] = [];
      for (const block of msg.content) {
        switch (block.type) {
          case "text":
            textParts.push(block.text);
            break;
          case "tool_use":
            toolUseParts.push(block);
            break;
          default:
            throw new Error(`Unsupported OpenAI assistant content block type "${block.type}".`);
        }
      }

      const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
        role: "assistant",
        content: textParts.length ? textParts.join("") : null,
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
      for (const block of msg.content) {
        result.push({
          role: "tool",
          tool_call_id: block.toolUseId,
          content: block.content,
        });
      }
    }
  }

  return result;
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

function parseToolArguments(args: string, context: string): Record<string, unknown> {
  const trimmedArgs = args.trim();
  if (!trimmedArgs) return {};

  try {
    const parsed: unknown = JSON.parse(trimmedArgs);

    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Tool arguments must be a JSON object");
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse tool arguments";
    throw new Error(`Invalid tool arguments for ${context}: ${message}`);
  }
}

function fromOpenAIResponse(response: OpenAI.ChatCompletion): LLMResponse {
  const choice = response.choices[0];
  if (!choice) {
    return {
      content: [],
      stopReason: "end_turn",
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      model: response.model,
    };
  }

  const content: LLMAssistantContentBlock[] = [];

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
          input: parseToolArguments(tc.function.arguments, `tool "${tc.function.name}"`),
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

function fromOpenAIFinishReason(reason: string | null): LLMResponse["stopReason"] {
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
  readonly provider: LLMProvider = "openai";
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create(buildOpenAIBaseRequest(options));

    return fromOpenAIResponse(response);
  }

  async *stream(options: LLMRequestOptions): AsyncIterable<LLMStreamEvent> {
    try {
      const streamRequest: ChatCompletionStreamRequest = {
        ...buildOpenAIBaseRequest(options),
        stream: true,
        stream_options: { include_usage: true },
      };
      const stream = await this.client.chat.completions.create(streamRequest);

      // Track state for assembling the final response
      let textContent = "";
      const toolCalls = new Map<
        number,
        { id: string; name: string; arguments: string; started: boolean }
      >();
      let model = options.model;
      let finishReason: string | null = null;
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
            let toolCall = toolCalls.get(tc.index);
            if (!toolCall) {
              toolCall = { id: "", name: "", arguments: "", started: false };
              toolCalls.set(tc.index, toolCall);
            }

            if (tc.id) {
              toolCall.id = tc.id;
            }
            if (tc.function?.name) {
              toolCall.name = tc.function.name;
            }

            if (!toolCall.started && (toolCall.id || toolCall.name)) {
              toolCall.started = true;
              yield {
                type: "tool_use_start",
                id: toolCall.id,
                name: toolCall.name,
              };
            }

            if (tc.function?.arguments) {
              toolCall.arguments += tc.function.arguments;
              yield {
                type: "tool_use_input_delta",
                inputDelta: tc.function.arguments,
              };
            }
          }
        }

        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
      }

      // Yield complete event after stream ends so usage data is captured
      const content: LLMAssistantContentBlock[] = [];
      if (textContent) {
        content.push({ type: "text", text: textContent });
      }
      for (const tc of toolCalls.values()) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: parseToolArguments(tc.arguments, `tool "${tc.name || tc.id || "unknown"}"`),
        });
      }

      yield {
        type: "complete",
        response: {
          content,
          stopReason: fromOpenAIFinishReason(finishReason),
          usage: { inputTokens, outputTokens },
          model,
        },
      };
    } catch (error) {
      yield toStreamError(error);
    }
  }
}
