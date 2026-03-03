import { generateStructured } from './aiService';

export interface SemanticContext {
  keyChanges?: Array<{ file: string; summary: string }>;
  decisions?: string[];
  tradeoffs?: string[];
  technicalContext?: string[];
  blockers?: string[];
}

export interface TicketMetadata {
  tags?: string[];
  complexity?: 'low' | 'medium' | 'high';
  semanticContext?: SemanticContext;
}

export interface GeneratedTicket {
  title: string;
  description: string;
  solutionApproach: string;
  metadata: TicketMetadata;
}

export interface TicketUpdate {
  description?: string;
  solutionApproach?: string;
  status?: string;
  metadata?: TicketMetadata;
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
  currentTicket: { title: string; description: string | null; solutionApproach: string | null; metadata?: unknown },
  eventsContext: string,
  summary: string,
  fileChanges?: Array<{ file: string; operation: string }>,
): Promise<TicketUpdate | null> {
  const existingMeta = (currentTicket.metadata ?? {}) as TicketMetadata;
  const existingSemantic = existingMeta.semanticContext;

  const fileChangesBlock = fileChanges?.length
    ? `\nFiles changed in this session:\n${fileChanges.map((f) => `- ${f.file} (${f.operation})`).join('\n')}`
    : '';

  const existingSemanticBlock = existingSemantic
    ? `\nExisting semantic context:\n${JSON.stringify(existingSemantic, null, 2)}`
    : '';

  return generateStructured<TicketUpdate>({
    system: `You are a project management assistant. Update a ticket based on recent work progress. Extract rich semantic information from the conversation — capture key changes, decisions, tradeoffs, technical context, and any blockers. Build on existing semantic context rather than replacing it.`,
    prompt: `Current ticket:
Title: ${currentTicket.title}
Description: ${currentTicket.description ?? 'None'}
Solution Approach: ${currentTicket.solutionApproach ?? 'None'}
${existingSemanticBlock}

Recent work summary:
${summary}

Recent events context:
${eventsContext}
${fileChangesBlock}

Update the ticket to reflect current progress. For keyChanges, include file paths and what was changed. For decisions, capture key choices made. For tradeoffs, note alternatives considered. For technicalContext, note APIs, patterns, or libraries used. For blockers, list any open questions or issues.`,
    toolName: 'update_ticket',
    toolDescription: 'Update a ticket with enriched semantic context from work progress',
    schema: {
      type: 'object' as const,
      properties: {
        description: { type: 'string', description: 'Updated description reflecting progress' },
        solutionApproach: { type: 'string', description: 'Updated approach based on what was done' },
        status: { type: 'string', enum: ['open', 'in_progress', 'resolved'], description: 'Current status' },
        metadata: {
          type: 'object',
          description: 'Updated metadata including semantic context',
          properties: {
            tags: { type: 'array', items: { type: 'string' }, description: 'Relevant tags' },
            complexity: { type: 'string', enum: ['low', 'medium', 'high'] },
            semanticContext: {
              type: 'object',
              description: 'Rich semantic information extracted from the conversation',
              properties: {
                keyChanges: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      file: { type: 'string', description: 'File path that was changed' },
                      summary: { type: 'string', description: 'What was changed in this file' },
                    },
                    required: ['file', 'summary'],
                  },
                  description: 'Files modified and what changed in each',
                },
                decisions: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Key decisions made during the work',
                },
                tradeoffs: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Tradeoffs discussed or considered',
                },
                technicalContext: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Technical context: APIs, patterns, libraries used',
                },
                blockers: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Open questions, blockers, or unresolved issues',
                },
              },
            },
          },
        },
      },
      required: ['description', 'solutionApproach', 'status', 'metadata'],
    },
    maxTokens: 1536,
  });
}

const MAX_ITEMS_PER_FIELD = 20;

/**
 * Merge new semantic context into existing, deduplicating strings and
 * capping each array at MAX_ITEMS_PER_FIELD to prevent unbounded growth.
 */
export function mergeSemanticContext(
  existing: SemanticContext | undefined,
  incoming: SemanticContext | undefined,
): SemanticContext | undefined {
  if (!incoming) return existing;
  if (!existing) return incoming;

  const mergeStringArrays = (a: string[] | undefined, b: string[] | undefined): string[] | undefined => {
    if (!b?.length) return a;
    if (!a?.length) return b?.slice(-MAX_ITEMS_PER_FIELD);
    const seen = new Set(a);
    const merged = [...a];
    for (const item of b) {
      if (!seen.has(item)) merged.push(item);
    }
    // Keep only the most recent items if over the cap
    return merged.slice(-MAX_ITEMS_PER_FIELD);
  };

  const mergeKeyChanges = (
    a: SemanticContext['keyChanges'],
    b: SemanticContext['keyChanges'],
  ): SemanticContext['keyChanges'] => {
    if (!b?.length) return a?.slice(-MAX_ITEMS_PER_FIELD);
    if (!a?.length) return b?.slice(-MAX_ITEMS_PER_FIELD);
    // Deduplicate by file path — keep the latest summary for each file
    const map = new Map<string, { file: string; summary: string }>();
    for (const item of a) map.set(item.file, item);
    for (const item of b) map.set(item.file, item);
    return [...map.values()].slice(-MAX_ITEMS_PER_FIELD);
  };

  return {
    keyChanges: mergeKeyChanges(existing.keyChanges, incoming.keyChanges),
    decisions: mergeStringArrays(existing.decisions, incoming.decisions),
    tradeoffs: mergeStringArrays(existing.tradeoffs, incoming.tradeoffs),
    technicalContext: mergeStringArrays(existing.technicalContext, incoming.technicalContext),
    blockers: incoming.blockers, // blockers are replaced, not accumulated — the latest state is the truth
  };
}
