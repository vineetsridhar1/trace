import { useCallback, useEffect, useState } from "react";
import { gql } from "@urql/core";
import { client } from "../../../lib/urql";
import {
  useEntityStore,
  type AiConversationEntity,
  type AiBranchEntity,
  type AiBranchSummaryEntity,
  type AiTurnEntity,
} from "../../../stores/entity";
import { useAuthStore } from "../../../stores/auth";
import { useAiConversationUIStore } from "../store/ai-conversation-ui";

// ── GraphQL documents ──────────────────────────────────────────

const AI_CONVERSATIONS_QUERY = gql`
  query AiConversations($organizationId: ID!) {
    aiConversations(organizationId: $organizationId) {
      id
      title
      visibility
      modelId
      systemPrompt
      branchCount
      createdBy {
        id
      }
      rootBranch {
        id
      }
      createdAt
      updatedAt
    }
  }
`;

const AI_CONVERSATION_QUERY = gql`
  query AiConversation($id: ID!) {
    aiConversation(id: $id) {
      id
      title
      visibility
      modelId
      systemPrompt
      branchCount
      createdBy {
        id
      }
      rootBranch {
        id
      }
      branches {
        id
        label
        depth
        turnCount
        parentBranch {
          id
        }
        forkTurn {
          id
        }
        childBranches {
          id
        }
        createdBy {
          id
        }
        createdAt
      }
      createdAt
      updatedAt
    }
  }
`;

const BRANCH_TIMELINE_QUERY = gql`
  query BranchTimeline($id: ID!) {
    branch(id: $id) {
      id
      label
      depth
      turnCount
      parentBranch {
        id
      }
      forkTurn {
        id
      }
      childBranches {
        id
      }
      createdBy {
        id
      }
      createdAt
      conversation {
        id
      }
      latestSummary {
        id
        branchId
        content
        summarizedTurnCount
        summarizedUpToTurnId
        createdAt
      }
      contextHealth {
        tokenUsage
        budgetTotal
        percentage
      }
      turns {
        id
        role
        content
        summarized
        parentTurn {
          id
        }
        branchCount
        createdAt
      }
    }
  }
`;

const CONTEXT_HEALTH_QUERY = gql`
  query ContextHealth($branchId: ID!) {
    contextHealth(branchId: $branchId) {
      tokenUsage
      budgetTotal
      percentage
    }
  }
`;

// ── Hydration helpers ──────────────────────────────────────────

interface RawConversation {
  id: string;
  title: string | null;
  visibility: string;
  modelId: string | null;
  systemPrompt: string | null;
  branchCount: number;
  createdBy: { id: string };
  rootBranch: { id: string };
  branches?: RawBranch[];
  createdAt: string;
  updatedAt: string;
}

interface RawBranch {
  id: string;
  label: string | null;
  depth: number;
  turnCount: number;
  parentBranch: { id: string } | null;
  forkTurn: { id: string } | null;
  childBranches: Array<{ id: string }>;
  createdBy: { id: string };
  createdAt: string;
  conversation?: { id: string };
  turns?: RawTurn[];
  latestSummary?: RawBranchSummary | null;
  contextHealth?: RawContextHealth;
}

interface RawTurn {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  summarized: boolean;
  parentTurn: { id: string } | null;
  branchCount: number;
  createdAt: string;
}

interface RawBranchSummary {
  id: string;
  branchId: string;
  content: string;
  summarizedTurnCount: number;
  summarizedUpToTurnId: string;
  createdAt: string;
}

interface RawContextHealth {
  tokenUsage: number;
  budgetTotal: number;
  percentage: number;
}

function hydrateConversation(raw: RawConversation): void {
  const { upsert } = useEntityStore.getState();
  const existing = useEntityStore.getState().aiConversations[raw.id];

  upsert("aiConversations", raw.id, {
    ...(existing ?? {}),
    id: raw.id,
    title: raw.title,
    visibility: raw.visibility,
    modelId: raw.modelId,
    systemPrompt: raw.systemPrompt,
    branchCount: raw.branchCount,
    createdById: raw.createdBy.id,
    rootBranchId: raw.rootBranch.id,
    branchIds: raw.branches?.map((b) => b.id) ?? existing?.branchIds ?? [raw.rootBranch.id],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  } as AiConversationEntity);

  if (raw.branches) {
    for (const branch of raw.branches) {
      hydrateBranch(branch, raw.id);
    }
  }
}

function hydrateBranch(raw: RawBranch, conversationId?: string): void {
  const { upsert } = useEntityStore.getState();
  const existing = useEntityStore.getState().aiBranches[raw.id];

  upsert("aiBranches", raw.id, {
    ...(existing ?? {}),
    id: raw.id,
    conversationId: conversationId ?? raw.conversation?.id ?? existing?.conversationId ?? "",
    label: raw.label,
    depth: raw.depth,
    turnCount: raw.turnCount,
    parentBranchId: raw.parentBranch?.id ?? null,
    forkTurnId: raw.forkTurn?.id ?? null,
    childBranchIds: raw.childBranches.map((b) => b.id),
    createdById: raw.createdBy.id,
    createdAt: raw.createdAt,
    turnIds: raw.turns?.map((t) => t.id) ?? existing?.turnIds ?? [],
  } as AiBranchEntity);

  if (raw.turns) {
    for (const turn of raw.turns) {
      hydrateTurn(turn, raw.id);
    }
  }

  if (raw.latestSummary) {
    hydrateBranchSummary(raw.latestSummary);
  }
}

function hydrateTurn(raw: RawTurn, branchId: string): void {
  const { upsert } = useEntityStore.getState();

  upsert("aiTurns", raw.id, {
    id: raw.id,
    branchId,
    role: raw.role,
    content: raw.content,
    summarized: raw.summarized ?? false,
    parentTurnId: raw.parentTurn?.id ?? null,
    branchCount: raw.branchCount,
    createdAt: raw.createdAt,
  } as AiTurnEntity);
}

function hydrateBranchSummary(raw: RawBranchSummary): void {
  const { upsert } = useEntityStore.getState();

  upsert("aiBranchSummaries", raw.id, {
    id: raw.id,
    branchId: raw.branchId,
    content: raw.content,
    summarizedTurnCount: raw.summarizedTurnCount,
    summarizedUpToTurnId: raw.summarizedUpToTurnId,
    createdAt: raw.createdAt,
  } as AiBranchSummaryEntity);
}

async function fetchBranchWithAncestors(
  branchId: string,
  visited: Set<string> = new Set(),
): Promise<void> {
  if (!branchId || visited.has(branchId)) return;
  visited.add(branchId);

  const result = await client.query(BRANCH_TIMELINE_QUERY, { id: branchId }).toPromise();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data?.branch) return;

  const branch = result.data.branch as RawBranch;
  hydrateBranch(branch);

  const parentBranchId = branch.parentBranch?.id;
  if (parentBranchId) {
    await fetchBranchWithAncestors(parentBranchId, visited);
  }
}

// ── Query hooks ────────────────────────────────────────────────

/** Fetches conversation list, upserts into store */
export function useAiConversationsQuery() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    setError(null);

    const result = await client
      .query(AI_CONVERSATIONS_QUERY, { organizationId: activeOrgId })
      .toPromise();

    if (result.error) {
      setError(result.error.message);
    } else if (result.data?.aiConversations) {
      const conversations = result.data.aiConversations as RawConversation[];
      for (const conv of conversations) {
        hydrateConversation(conv);
      }
    }

    setLoading(false);
  }, [activeOrgId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return { loading, error, refetch: fetchConversations };
}

/** Fetches single conversation with branches */
export function useAiConversationQuery(id: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversation = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const result = await client.query(AI_CONVERSATION_QUERY, { id }).toPromise();

    if (result.error) {
      setError(result.error.message);
    } else if (result.data?.aiConversation) {
      const conv = result.data.aiConversation as RawConversation;
      hydrateConversation(conv);

      // Set active branch to root if not already set
      const uiStore = useAiConversationUIStore.getState();
      if (!uiStore.activeBranchByConversation[id]) {
        uiStore.setActiveBranch(id, conv.rootBranch.id);
      }
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchConversation();
  }, [fetchConversation]);

  return { loading, error, refetch: fetchConversation };
}

/** Hydrates the active branch plus ancestor turns for rendering the timeline */
export function useBranchTimelineQuery(branchId: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    try {
      await fetchBranchWithAncestors(branchId);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load branch timeline");
    }

    setLoading(false);
  }, [branchId]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  return { loading, error, refetch: fetchTimeline };
}

export interface ContextHealthData {
  tokenUsage: number;
  budgetTotal: number;
  percentage: number;
}

/** Fetches context health for a branch */
export function useContextHealthQuery(branchId: string) {
  const [data, setData] = useState<ContextHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);

    const result = await client.query(CONTEXT_HEALTH_QUERY, { branchId }).toPromise();

    if (result.data?.contextHealth) {
      setData(result.data.contextHealth as ContextHealthData);
    }
    setLoading(false);
  }, [branchId]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  return { data, loading, refetch: fetchHealth };
}
