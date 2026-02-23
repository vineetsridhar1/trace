import { generateStructured } from './aiService';

export interface GeneratedTicket {
  title: string;
  description: string;
  solutionApproach: string;
  metadata: Record<string, unknown>;
}

export interface TicketUpdate {
  description?: string;
  solutionApproach?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export async function generateTicketFromMessage(
  text: string,
  channelName: string,
): Promise<GeneratedTicket | null> {
  return generateStructured<GeneratedTicket>({
    system: `You are a project management assistant. Create a structured ticket from a user's message. The channel is "${channelName}".`,
    prompt: `Create a ticket from this message:\n\n${text}`,
    toolName: 'create_ticket',
    toolDescription: 'Create a structured ticket from a user message',
    schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Short, descriptive ticket title (max 80 chars)' },
        description: { type: 'string', description: 'Clear description of what needs to be done' },
        solutionApproach: { type: 'string', description: 'Suggested approach to solve this' },
        metadata: {
          type: 'object',
          description: 'Any extra metadata (tags, complexity, etc.)',
          properties: {
            tags: { type: 'array', items: { type: 'string' } },
            complexity: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
        },
      },
      required: ['title', 'description', 'solutionApproach', 'metadata'],
    },
    maxTokens: 512,
  });
}

export async function updateTicketFromContext(
  currentTicket: { title: string; description: string | null; solutionApproach: string | null },
  eventsContext: string,
  summary: string,
): Promise<TicketUpdate | null> {
  return generateStructured<TicketUpdate>({
    system: 'You are a project management assistant. Update a ticket based on recent work progress.',
    prompt: `Current ticket:
Title: ${currentTicket.title}
Description: ${currentTicket.description ?? 'None'}
Solution Approach: ${currentTicket.solutionApproach ?? 'None'}

Recent work summary:
${summary}

Recent events context:
${eventsContext}

Update the ticket to reflect current progress.`,
    toolName: 'update_ticket',
    toolDescription: 'Update a ticket based on work progress',
    schema: {
      type: 'object' as const,
      properties: {
        description: { type: 'string', description: 'Updated description reflecting progress' },
        solutionApproach: { type: 'string', description: 'Updated approach based on what was done' },
        status: { type: 'string', enum: ['open', 'in_progress', 'resolved'], description: 'Current status' },
        metadata: { type: 'object', description: 'Updated metadata' },
      },
      required: ['description', 'solutionApproach', 'status'],
    },
    maxTokens: 512,
  });
}
