import Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '../../prisma/generated/prisma/client';
import prisma from '../lib/prisma';
import { config } from '../config';
import { pubsub, TOPICS } from './pubsub';
import { generateText } from './aiService';

// --- Types ---

export interface ReviewOutput {
  summary: string;
  verdict: 'approve' | 'request_changes' | 'comment';
  confidence: number;
  issues: {
    severity: 'critical' | 'major' | 'minor' | 'nit';
    category: string;
    file?: string;
    line?: number;
    title: string;
    description: string;
    suggestion?: string;
  }[];
  positives: string[];
}

export interface RunInput {
  title: string;
  description?: string;
  diff: string;
  prUrl?: string;
  metadata?: Record<string, unknown>;
}

// --- Anthropic client ---

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return anthropicClient;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

// --- Review output schema (for tool-use parsing) ---

const REVIEW_OUTPUT_SCHEMA: Anthropic.Tool = {
  name: 'submit_review',
  description: 'Submit your structured code review',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: { type: 'string', description: 'Brief summary of your review findings' },
      verdict: {
        type: 'string',
        enum: ['approve', 'request_changes', 'comment'],
        description: 'Your overall verdict',
      },
      confidence: {
        type: 'number',
        description: 'Confidence level from 0 to 1',
      },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['critical', 'major', 'minor', 'nit'] },
            category: { type: 'string', description: 'Category like security, performance, style, logic, etc.' },
            file: { type: 'string', description: 'File path if applicable' },
            line: { type: 'number', description: 'Line number if applicable' },
            title: { type: 'string', description: 'Short title for the issue' },
            description: { type: 'string', description: 'Detailed description of the issue' },
            suggestion: { type: 'string', description: 'Suggested fix if applicable' },
          },
          required: ['severity', 'category', 'title', 'description'],
        },
      },
      positives: {
        type: 'array',
        items: { type: 'string' },
        description: 'Positive aspects of the code',
      },
    },
    required: ['summary', 'verdict', 'confidence', 'issues', 'positives'],
  },
};

// --- Prompt building ---

function buildStepPrompt(
  agent: { name: string; role: string; systemPrompt: string },
  input: RunInput,
  priorSteps: { reviewAgent: { name: string; role: string }; review: unknown }[],
): { system: string; user: string } {
  const system = agent.systemPrompt;

  let user = `# Code Review Request

## Title
${input.title}

${input.description ? `## Description\n${input.description}\n` : ''}
${input.prUrl ? `## PR URL\n${input.prUrl}\n` : ''}
## Diff
\`\`\`diff
${input.diff}
\`\`\``;

  if (priorSteps.length > 0) {
    user += '\n\n# Prior Reviews from Other Agents\n';
    for (const step of priorSteps) {
      user += `\n## Review by ${step.reviewAgent.name} (${step.reviewAgent.role})\n`;
      user += '```json\n' + JSON.stringify(step.review, null, 2) + '\n```\n';
    }
    user += '\nConsider the above reviews but provide your own independent assessment from your area of expertise.\n';
  }

  user += '\n\nPlease review this code change and use the submit_review tool to provide your structured review.';

  return { system, user };
}

// --- Step execution ---

async function executeStep(stepId: string): Promise<void> {
  const step = await prisma.reviewStep.findUniqueOrThrow({
    where: { id: stepId },
    include: {
      run: true,
      reviewAgent: true,
    },
  });

  // Fetch prior completed steps for cross-agent context
  const priorSteps = await prisma.reviewStep.findMany({
    where: {
      runId: step.runId,
      status: 'done',
      reviewAgent: { sortOrder: { lt: step.reviewAgent.sortOrder } },
    },
    include: { reviewAgent: { select: { name: true, role: true } } },
    orderBy: { reviewAgent: { sortOrder: 'asc' } },
  });

  // Mark step as running
  await prisma.reviewStep.update({
    where: { id: stepId },
    data: { status: 'running', startedAt: new Date() },
  });

  pubsub.publish(TOPICS.REVIEW_RUN_UPDATED(step.runId), {
    reviewRunUpdated: await getRun(step.runId),
  });

  try {
    const anthropic = getAnthropicClient();
    const input = step.run.input as unknown as RunInput;
    const { system, user } = buildStepPrompt(step.reviewAgent, input, priorSteps);

    const model = step.reviewAgent.model ?? DEFAULT_MODEL;
    const maxTokens = step.reviewAgent.maxTokens ?? DEFAULT_MAX_TOKENS;

    // Stream the response — with tool_choice forced, only inputJson events fire
    const stream = anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
      tools: [REVIEW_OUTPUT_SCHEMA],
      tool_choice: { type: 'tool', name: 'submit_review' },
    });

    stream.on('inputJson', (_partialJson, jsonSnapshot) => {
      pubsub.publish(TOPICS.REVIEW_STEP_STREAM(step.runId), {
        reviewStepStream: {
          runId: step.runId,
          stepId: step.id,
          agentName: step.reviewAgent.name,
          type: 'token',
          delta: jsonSnapshot,
          review: null,
        },
      });
    });

    const finalMessage = await stream.finalMessage();

    // Extract the tool use result
    const toolBlock = finalMessage.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    const review = toolBlock ? (toolBlock.input as ReviewOutput) : null;
    const tokensUsed =
      (finalMessage.usage?.input_tokens ?? 0) + (finalMessage.usage?.output_tokens ?? 0);

    // Save step result
    await prisma.reviewStep.update({
      where: { id: stepId },
      data: {
        status: 'done',
        review: review as any,
        rawResponse: JSON.stringify(finalMessage.content),
        tokensUsed,
        completedAt: new Date(),
      },
    });

    // Publish step done event
    pubsub.publish(TOPICS.REVIEW_STEP_STREAM(step.runId), {
      reviewStepStream: {
        runId: step.runId,
        stepId: step.id,
        agentName: step.reviewAgent.name,
        type: 'step_done',
        delta: null,
        review,
      },
    });
  } catch (error) {
    console.error(`[reviewRunService] executeStep error for step ${stepId}:`, error);

    await prisma.reviewStep.update({
      where: { id: stepId },
      data: {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    });

    pubsub.publish(TOPICS.REVIEW_STEP_STREAM(step.runId), {
      reviewStepStream: {
        runId: step.runId,
        stepId: step.id,
        agentName: step.reviewAgent.name,
        type: 'error',
        delta: null,
        review: null,
      },
    });

    throw error;
  }
}

// --- Run orchestration ---

export async function startRun(workflowId: string, input: RunInput, workspaceId?: string) {
  // Fetch workflow with agents
  const workflow = await prisma.reviewWorkflow.findUniqueOrThrow({
    where: { id: workflowId },
    include: { agents: { orderBy: { sortOrder: 'asc' } } },
  });

  if (workflow.agents.length === 0) {
    throw new Error('Workflow has no agents configured');
  }

  // Create run + steps
  const run = await prisma.reviewRun.create({
    data: {
      workflowId,
      workspaceId,
      status: 'pending',
      input: input as any,
      steps: {
        create: workflow.agents.map((agent) => ({
          agentId: agent.id,
          status: 'pending',
        })),
      },
    },
    include: {
      steps: {
        include: { reviewAgent: true },
        orderBy: { reviewAgent: { sortOrder: 'asc' } },
      },
    },
  });

  // Set status to running
  await prisma.reviewRun.update({
    where: { id: run.id },
    data: { status: 'running' },
  });

  pubsub.publish(TOPICS.REVIEW_RUN_UPDATED(run.id), {
    reviewRunUpdated: await getRun(run.id),
  });

  // Execute steps sequentially in background (don't block the caller)
  executeRunSteps(run.id, run.steps.map((s) => s.id)).catch((error) => {
    console.error(`[reviewRunService] Run ${run.id} failed:`, error);
  });

  return run;
}

async function executeRunSteps(runId: string, stepIds: string[]): Promise<void> {
  try {
    for (const stepId of stepIds) {
      // Check if run was cancelled
      const run = await prisma.reviewRun.findUnique({ where: { id: runId } });
      if (run?.status === 'cancelled') return;

      await executeStep(stepId);
    }

    // Generate summary from all step reviews
    const completedSteps = await prisma.reviewStep.findMany({
      where: { runId, status: 'done' },
      include: { reviewAgent: { select: { name: true, role: true } } },
    });

    const summaryParts = completedSteps.map((step) => {
      const review = step.review as unknown as ReviewOutput | null;
      return `**${step.reviewAgent.name}** (${step.reviewAgent.role}): ${review?.verdict ?? 'no verdict'} — ${review?.summary ?? 'no summary'}`;
    });

    let summary = summaryParts.join('\n\n');

    // Use AI to generate a concise overall summary if we have reviews
    if (completedSteps.length > 0) {
      const aiSummary = await generateText({
        system: 'You are a technical writing assistant. Summarize the following code review results into a concise paragraph.',
        prompt: `Summarize these code review results:\n\n${summaryParts.join('\n')}`,
        maxTokens: 512,
      });
      if (aiSummary) {
        summary = aiSummary;
      }
    }

    await prisma.reviewRun.update({
      where: { id: runId },
      data: { status: 'completed', summary },
    });

    pubsub.publish(TOPICS.REVIEW_RUN_UPDATED(runId), {
      reviewRunUpdated: await getRun(runId),
    });
  } catch (error) {
    console.error(`[reviewRunService] executeRunSteps error for run ${runId}:`, error);

    await prisma.reviewRun.update({
      where: { id: runId },
      data: { status: 'failed' },
    });

    pubsub.publish(TOPICS.REVIEW_RUN_UPDATED(runId), {
      reviewRunUpdated: await getRun(runId),
    });
  }
}

// --- Cancel / Retry ---

export async function cancelRun(runId: string) {
  // Skip all pending steps
  await prisma.reviewStep.updateMany({
    where: { runId, status: 'pending' },
    data: { status: 'skipped' },
  });

  const run = await prisma.reviewRun.update({
    where: { id: runId },
    data: { status: 'cancelled' },
    include: {
      steps: {
        include: { reviewAgent: true },
        orderBy: { reviewAgent: { sortOrder: 'asc' } },
      },
    },
  });

  pubsub.publish(TOPICS.REVIEW_RUN_UPDATED(runId), {
    reviewRunUpdated: run,
  });

  return run;
}

export async function retryStep(stepId: string) {
  const step = await prisma.reviewStep.update({
    where: { id: stepId },
    data: {
      status: 'pending',
      review: Prisma.DbNull,
      rawResponse: null,
      tokensUsed: null,
      costCents: null,
      error: null,
      startedAt: null,
      completedAt: null,
    },
    include: { reviewAgent: true },
  });

  // Execute in background
  executeStep(stepId).catch((error) => {
    console.error(`[reviewRunService] retryStep error for step ${stepId}:`, error);
  });

  return step;
}

// --- Queries ---

export async function getRun(runId: string) {
  return prisma.reviewRun.findUnique({
    where: { id: runId },
    include: {
      steps: {
        include: { reviewAgent: true },
        orderBy: { reviewAgent: { sortOrder: 'asc' } },
      },
      workflow: true,
    },
  });
}

export async function listRuns(
  workflowId: string,
  options: { limit?: number; offset?: number } = {},
) {
  const { limit = 20, offset = 0 } = options;

  const [runs, total] = await Promise.all([
    prisma.reviewRun.findMany({
      where: { workflowId },
      include: {
        steps: {
          include: { reviewAgent: true },
          orderBy: { reviewAgent: { sortOrder: 'asc' } },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.reviewRun.count({ where: { workflowId } }),
  ]);

  return { runs, total, limit, offset };
}

// --- Workspace integration ---

export async function startRunForWorkspace(workflowId: string, workspaceId: string) {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: {
      id: true,
      branch: true,
      preview: true,
      summary: true,
      prUrl: true,
    },
  });

  const input: RunInput = {
    title: workspace.preview ?? workspace.branch ?? 'Workspace review',
    description: workspace.summary ?? undefined,
    diff: '', // Diff will be populated by the caller (Electron IPC fetches git diff)
    prUrl: workspace.prUrl ?? undefined,
    metadata: { workspaceId: workspace.id, branch: workspace.branch },
  };

  return startRun(workflowId, input, workspaceId);
}
