import { useCallback, useEffect, useState } from "react";
import { gql } from "@urql/core";
import { client } from "../../../lib/urql";
import { useEntityStore, type AiConversationEntity, type AiBranchEntity, type AiTurnEntity } from "../../../stores/entity";
import { useAuthStore } from "../../../stores/auth";
import { useAiConversationUIStore } from "../store/ai-conversation-ui";

// ── GraphQL documents ──────────────────────────────────────────

const AI_CONVERSATIONS_QUERY = gql`
  query AiConversations($organizationId: ID!) {
    aiConversations(organizationId: $organizationId) {
      id
      title
      visibility
      branchCount
      createdBy { id }
      rootBranch { id }
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
      branchCount
      createdBy { id }
      rootBranch { id }
      branches {
        id
        label
        depth
        turnCount
        parentBranch { id }
        forkTurn { id }
        childBranches { id }
        createdBy { id }
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
      parentBranch { id }
      forkTurn { id }
      childBranches { id }
      createdBy { id }
      createdAt
      conversation { id }
      turns {
        id
        role
        content
        parentTurn { id }
        branchCount
        createdAt
      }
    }
  }
`;

// ── Hydration helpers ──────────────────────────────────────────

interface RawConversation {
  id: string;
  title: string | null;
  visibility: string;
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
}

interface RawTurn {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  parentTurn: { id: string } | null;
  branchCount: number;
  createdAt: string;
}

function hydrateConversation(raw: RawConversation): void {
  const { upsert } = useEntityStore.getState();
  const existing = useEntityStore.getState().aiConversations[raw.id];

  upsert("aiConversations", raw.id, {
    ...(existing ?? {}),
    id: raw.id,
    title: raw.title,
    visibility: raw.visibility,
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
}

function hydrateTurn(raw: RawTurn, branchId: string): void {
  const { upsert } = useEntityStore.getState();

  upsert("aiTurns", raw.id, {
    id: raw.id,
    branchId,
    role: raw.role,
    content: raw.content,
    parentTurnId: raw.parentTurn?.id ?? null,
    branchCount: raw.branchCount,
    createdAt: raw.createdAt,
  } as AiTurnEntity);
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

    const result = await client
      .query(AI_CONVERSATION_QUERY, { id })
      .toPromise();

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

    const result = await client
      .query(BRANCH_TIMELINE_QUERY, { id: branchId })
      .toPromise();

    if (result.error) {
      setError(result.error.message);
    } else if (result.data?.branch) {
      const branch = result.data.branch as RawBranch;
      hydrateBranch(branch);
    }

    setLoading(false);
  }, [branchId]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  return { loading, error, refetch: fetchTimeline };
}
