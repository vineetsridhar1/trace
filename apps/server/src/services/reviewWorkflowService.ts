import prisma from '../lib/prisma';

export interface AgentInput {
  name: string;
  role: string;
  systemPrompt: string;
  sortOrder?: number;
  model?: string;
  maxTokens?: number;
  config?: any;
}

// --- Workflow CRUD ---

export async function createWorkflow(
  channelId: string,
  data: { name: string; description?: string; agents: AgentInput[] },
) {
  return prisma.$transaction(async (tx) => {
    const workflow = await tx.reviewWorkflow.create({
      data: {
        channelId,
        name: data.name,
        description: data.description,
        agents: {
          create: data.agents.map((agent, index) => ({
            name: agent.name,
            role: agent.role,
            systemPrompt: agent.systemPrompt,
            sortOrder: agent.sortOrder ?? index,
            model: agent.model,
            maxTokens: agent.maxTokens,
            config: agent.config,
          })),
        },
      },
      include: { agents: { orderBy: { sortOrder: 'asc' } } },
    });
    return workflow;
  });
}

export async function updateWorkflow(
  workflowId: string,
  data: { name?: string; description?: string },
) {
  return prisma.reviewWorkflow.update({
    where: { id: workflowId },
    data,
    include: { agents: { orderBy: { sortOrder: 'asc' } } },
  });
}

export async function deleteWorkflow(workflowId: string) {
  return prisma.reviewWorkflow.delete({ where: { id: workflowId } });
}

export async function getWorkflow(workflowId: string) {
  return prisma.reviewWorkflow.findUnique({
    where: { id: workflowId },
    include: { agents: { orderBy: { sortOrder: 'asc' } } },
  });
}

export async function listWorkflows(channelId: string) {
  return prisma.reviewWorkflow.findMany({
    where: { channelId },
    include: { agents: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
}

// --- Agent CRUD ---

export async function addAgent(workflowId: string, data: AgentInput) {
  return prisma.reviewAgent.create({
    data: {
      workflowId,
      name: data.name,
      role: data.role,
      systemPrompt: data.systemPrompt,
      sortOrder: data.sortOrder ?? 0,
      model: data.model,
      maxTokens: data.maxTokens,
      config: data.config,
    },
  });
}

export async function updateAgent(agentId: string, data: Partial<AgentInput>) {
  return prisma.reviewAgent.update({
    where: { id: agentId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.role !== undefined && { role: data.role }),
      ...(data.systemPrompt !== undefined && { systemPrompt: data.systemPrompt }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      ...(data.model !== undefined && { model: data.model }),
      ...(data.maxTokens !== undefined && { maxTokens: data.maxTokens }),
      ...(data.config !== undefined && { config: data.config }),
    },
  });
}

export async function removeAgent(agentId: string) {
  return prisma.reviewAgent.delete({ where: { id: agentId } });
}

export async function reorderAgents(workflowId: string, agentIds: string[]) {
  return prisma.$transaction(
    agentIds.map((id, index) =>
      prisma.reviewAgent.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );
}
