import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { config } from '../config';

// --- Anthropic client ---

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return anthropicClient;
}

// --- OpenAI client ---

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!config.openaiApiKey) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return openaiClient;
}

// --- Models ---

const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

// --- Text generation ---

interface GenerateTextOptions {
  system?: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}

async function generateTextAnthropic(options: GenerateTextOptions): Promise<string | null> {
  const anthropic = getAnthropicClient();
  if (!anthropic) return null;

  const response = await anthropic.messages.create({
    model: options.model ?? DEFAULT_ANTHROPIC_MODEL,
    max_tokens: options.maxTokens ?? 1024,
    ...(options.system ? { system: options.system } : {}),
    messages: [{ role: 'user', content: options.prompt }],
  });

  const block = response.content[0];
  return block?.type === 'text' ? block.text : null;
}

async function generateTextOpenAI(options: GenerateTextOptions): Promise<string | null> {
  const openai = getOpenAIClient();
  if (!openai) return null;

  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (options.system) {
    messages.push({ role: 'system', content: options.system });
  }
  messages.push({ role: 'user', content: options.prompt });

  const response = await openai.chat.completions.create({
    model: options.model ?? DEFAULT_OPENAI_MODEL,
    max_completion_tokens: options.maxTokens ?? 1024,
    messages,
  });

  return response.choices[0]?.message?.content ?? null;
}

export async function generateText(options: GenerateTextOptions): Promise<string | null> {
  try {
    if (config.aiProvider === 'anthropic') {
      return await generateTextAnthropic(options);
    }
    return await generateTextOpenAI(options);
  } catch (error) {
    console.error('[aiService] generateText error:', error);
    return null;
  }
}

// --- Structured generation ---

interface GenerateStructuredOptions<T> {
  system?: string;
  prompt: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  model?: string;
  maxTokens?: number;
  fallback?: T;
}

async function generateStructuredAnthropic<T>(options: GenerateStructuredOptions<T>): Promise<T | null> {
  const anthropic = getAnthropicClient();
  if (!anthropic) return options.fallback ?? null;

  const response = await anthropic.messages.create({
    model: options.model ?? DEFAULT_ANTHROPIC_MODEL,
    max_tokens: options.maxTokens ?? 1024,
    ...(options.system ? { system: options.system } : {}),
    messages: [{ role: 'user', content: options.prompt }],
    tools: [
      {
        name: options.toolName,
        description: options.toolDescription,
        input_schema: options.schema as Anthropic.Tool['input_schema'],
      },
    ],
    tool_choice: { type: 'tool', name: options.toolName },
  });

  const toolBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );

  return toolBlock ? (toolBlock.input as T) : (options.fallback ?? null);
}

async function generateStructuredOpenAI<T>(options: GenerateStructuredOptions<T>): Promise<T | null> {
  const openai = getOpenAIClient();
  if (!openai) return options.fallback ?? null;

  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (options.system) {
    messages.push({ role: 'system', content: options.system });
  }
  messages.push({ role: 'user', content: options.prompt });

  const response = await openai.chat.completions.create({
    model: options.model ?? DEFAULT_OPENAI_MODEL,
    max_completion_tokens: options.maxTokens ?? 1024,
    messages,
    tools: [
      {
        type: 'function',
        function: {
          name: options.toolName,
          description: options.toolDescription,
          parameters: options.schema,
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: options.toolName } },
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (toolCall && toolCall.type === 'function') {
    try {
      return JSON.parse(toolCall.function.arguments) as T;
    } catch {
      console.error('[aiService] Failed to parse OpenAI tool call arguments');
      return options.fallback ?? null;
    }
  }

  return options.fallback ?? null;
}

export async function generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T | null> {
  try {
    if (config.aiProvider === 'anthropic') {
      return await generateStructuredAnthropic(options);
    }
    return await generateStructuredOpenAI(options);
  } catch (error) {
    console.error('[aiService] generateStructured error:', error);
    return options.fallback ?? null;
  }
}
