import prisma from '../lib/prisma';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { generateText } from './aiService';
import { sseManager } from './sseManager';

const AI_CHAT_SYSTEM_PROMPT = `You are a helpful coding assistant in the Trace development environment. You can read and understand code but you CANNOT modify any files.

## Capabilities
- Explain code, architecture, and patterns
- Suggest approaches in natural language
- Describe what changes would be needed (without producing code diffs or file writes)
- Answer questions about programming concepts

## Constraints
- NEVER output code modifications, diffs, patches, or file writes
- When suggesting changes, describe them in plain English
- Never produce complete replacement code blocks

## Tickets
- When you identify actionable work, suggest it naturally: "This could be a good ticket: [title] — [description]"
- Only create tickets directly when the user explicitly asks`;

let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return anthropicClient;
}

export async function createAiChat(serverId: string, channelId?: string | null, title?: string | null) {
  return prisma.aiChat.create({
    data: {
      serverId,
      channelId: channelId ?? undefined,
      title: title ?? 'New Chat',
    },
    include: { messages: { take: 1, orderBy: { createdAt: 'desc' } } },
  });
}

export async function listAiChats(serverId: string) {
  return prisma.aiChat.findMany({
    where: { serverId },
    orderBy: { updatedAt: 'desc' },
    include: { messages: { take: 1, orderBy: { createdAt: 'desc' } } },
  });
}

export async function deleteAiChat(id: string) {
  await prisma.aiChat.delete({ where: { id } });
}

export async function renameAiChat(id: string, title: string) {
  return prisma.aiChat.update({
    where: { id },
    data: { title },
    include: { messages: { take: 1, orderBy: { createdAt: 'desc' } } },
  });
}

export async function getMessages(chatId: string, opts: { limit?: number; offset?: number } = {}) {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const [messages, total] = await Promise.all([
    prisma.aiChatMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.aiChatMessage.count({ where: { chatId } }),
  ]);

  return { messages, total, limit, offset };
}

export async function addUserMessage(chatId: string, content: string) {
  const message = await prisma.aiChatMessage.create({
    data: { chatId, role: 'user', content },
  });

  // Touch the chat's updatedAt
  await prisma.aiChat.update({
    where: { id: chatId },
    data: { updatedAt: new Date() },
  });

  return message;
}

export async function streamAiResponse(chatId: string) {
  const client = getAnthropicClient();
  if (!client) {
    sseManager.broadcastAiChat(chatId, 'error', { error: 'Anthropic API key not configured' });
    return;
  }

  // Load conversation history (last 50 messages)
  const history = await prisma.aiChatMessage.findMany({
    where: { chatId },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // Build system prompt with optional repo context
  let systemPrompt = AI_CHAT_SYSTEM_PROMPT;
  const chat = await prisma.aiChat.findUnique({
    where: { id: chatId },
    include: { channel: true },
  });
  if (chat?.channel) {
    systemPrompt += `\n\n## Repository Context\nThis chat is associated with channel: ${chat.channel.name}`;
  }

  try {
    const stream = client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    let fullContent = '';

    stream.on('text', (text) => {
      fullContent += text;
      sseManager.broadcastAiChat(chatId, 'token', { delta: text });
    });

    stream.on('error', (error) => {
      console.error('[aiChatService] Stream error:', error);
      sseManager.broadcastAiChat(chatId, 'error', { error: 'Stream error' });
    });

    stream.on('end', async () => {
      if (fullContent) {
        await prisma.aiChatMessage.create({
          data: { chatId, role: 'assistant', content: fullContent },
        });
        await prisma.aiChat.update({
          where: { id: chatId },
          data: { updatedAt: new Date() },
        });
      }
      sseManager.broadcastAiChat(chatId, 'done', { content: fullContent });
    });
  } catch (error) {
    console.error('[aiChatService] streamAiResponse error:', error);
    sseManager.broadcastAiChat(chatId, 'error', { error: 'Failed to start stream' });
  }
}

export async function autoTitle(chatId: string, firstMessage: string) {
  const title = await generateText({
    system: 'Generate a very short title (3-6 words) for a chat conversation. Return ONLY the title, nothing else.',
    prompt: firstMessage,
  });

  if (title) {
    const cleaned = title.replace(/^["']|["']$/g, '').trim();
    await prisma.aiChat.update({
      where: { id: chatId },
      data: { title: cleaned },
    });
    return cleaned;
  }
  return null;
}
