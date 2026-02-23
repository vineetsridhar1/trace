import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

interface GenerateTextOptions {
  system?: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}

export async function generateText(options: GenerateTextOptions): Promise<string | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const response = await anthropic.messages.create({
      model: options.model ?? DEFAULT_MODEL,
      max_tokens: options.maxTokens ?? 1024,
      system: options.system ?? '',
      messages: [{ role: 'user', content: options.prompt }],
    });

    const block = response.content[0];
    return block?.type === 'text' ? block.text : null;
  } catch (error) {
    console.error('[aiService] generateText error:', error);
    return null;
  }
}

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

export async function generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T | null> {
  const anthropic = getClient();
  if (!anthropic) return options.fallback ?? null;

  try {
    const response = await anthropic.messages.create({
      model: options.model ?? DEFAULT_MODEL,
      max_tokens: options.maxTokens ?? 1024,
      system: options.system ?? '',
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
  } catch (error) {
    console.error('[aiService] generateStructured error:', error);
    return options.fallback ?? null;
  }
}
