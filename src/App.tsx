import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Workspace,
  Channel,
  ChannelType,
  LocalChannelConfig,
  MiddlePanelView,
  PullRequest,
  TicketStatus,
} from "./types";
import { gql } from "@apollo/client";
import { WORKSPACE_FIELDS } from "./graphql/fragments";
import {
  useUpdateWorkspaceStatusMutation,
  useDeleteWorkspaceMutation,
  useSetWorkspacePrUrlMutation,
} from "./__generated__/App.generated";
import { useCreateWorkspaceMutation } from "./hooks/__generated__/useAgentMessageActions.generated";
import { useWorkspaceSync } from "./hooks/useWorkspaceSync";
import { useThreadSync } from "./hooks/useThreadSync";
import { usePanelResize } from "./hooks/usePanelResize";
import { useChannelSubscriptions } from "./hooks/useChannelSubscriptionsV2";
import { useChannelMessageNotifications } from "./hooks/useChannelMessageNotifications";
import { useTerminalInit } from "./hooks/useTerminalInit";
import { useWorkspaceActions } from "./hooks/useAgentWorkspaceActions";
import { useStuckWorkspaceReconciliation } from "./hooks/useStuckWorkspaceReconciliation";
import { useSyncPolling } from "./hooks/useSyncPolling";
import { useKanbanSync } from "./hooks/useKanbanSync";
import { useAiChatSync } from "./hooks/useAiChatSync";
import { ChannelProvider, useChannelContext } from "./context/ChannelContext";
import { useAuth } from "./context/AuthContext";
import { ChannelPanel } from "./components/ChannelPanel";
import { ChannelTopBar } from "./components/ChannelTopBar";
import { MessagePanel } from "./components/MessagePanel";
import { ChannelSettingsModal } from "./components/ChannelSettingsModal";
import { JoinChannelModal } from "./components/JoinChannelModal";
import { CreateChannelModal } from "./components/CreateChannelModal";
import { CreateServerModal } from "./components/CreateServerModal";
import { ProductDocModal } from "./components/ProductDocModal";
import { NewWorkspaceModal } from "./components/NewWorkspaceModal";
import { ProductDocView } from "./components/ProductDocView";
import { AiChatPanel } from "./components/AiChatPanel";
import { ShortcutHelpDialog } from "./components/ShortcutHelpDialog";
import { CommandPalette } from "./components/CommandPalette";
import { Toaster, toast } from "sonner";
import { FiCheckCircle, FiGitMerge, FiAlertCircle } from "react-icons/fi";

// Zustand stores
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useThreadStore } from "./stores/threadStore";
import { useTerminalStore } from "./stores/terminalStore";
import { useKanbanStore } from "./stores/kanbanStore";
import {
  useAppUIStore,
  isViewValidForChannel,
  getDefaultViewForChannel,
} from "./stores/appUIStore";
import { useAgentRunStore } from "./stores/agentRunStore";
import { usePanelLayoutStore } from "./stores/panelLayoutStore";
import { useSyncStore } from "./stores/syncStore";
import { useShortcuts } from "./hooks/useShortcuts";
import { useShortcutContextSync } from "./hooks/useShortcutContextSync";
import { useDefaultShortcuts } from "./hooks/useDefaultShortcuts";
import {
  usePresenceReporter,
  usePresenceSubscription,
} from "./hooks/usePresence";
import { usePresenceStore } from "./stores/presenceStore";
import { ExpandableText } from "./components/thread-events/ExpandableText";

const GQL_UPDATE_WORKSPACE_STATUS = gql`
  mutation UpdateWorkspaceStatus(
    $channelId: ID!
    $workspaceId: ID!
    $status: String!
  ) {
    updateWorkspaceStatus(
      channelId: $channelId
      workspaceId: $workspaceId
      status: $status
    ) {
      ...WorkspaceFields
    }
  }
  ${WORKSPACE_FIELDS}
`;

const GQL_DELETE_WORKSPACE = gql`
  mutation DeleteWorkspace($channelId: ID!, $workspaceId: ID!) {
    deleteWorkspace(channelId: $channelId, workspaceId: $workspaceId)
  }
`;

const GQL_SET_WORKSPACE_PR_URL = gql`
  mutation SetWorkspacePrUrl(
    $channelId: ID!
    $workspaceId: ID!
    $prUrl: String!
  ) {
    setWorkspacePrUrl(
      channelId: $channelId
      workspaceId: $workspaceId
      prUrl: $prUrl
    )
  }
`;

function buildProductDocPrompt(userPrompt: string): string {
  return `<trace-internal>
You are a senior product manager. Your job is to help the user create a Product Scoping document that defines WHAT to build and WHY — not HOW to build it. Technical implementation details belong in a separate Technical Scoping phase that comes after this one.

## CRITICAL FILE RESTRICTION

You are allowed to WRITE to exactly ONE file: ./.trace/product-scoping.md
You MUST NOT create, modify, or delete any other file in this repository. No exceptions.
You MAY read any file in the codebase to understand existing functionality, user-facing behavior, and what the product currently does.

## Your workflow

1. **EXPLORE THE CODEBASE**: Before asking questions, read key files to understand:
   - What the product currently does and how users interact with it
   - Existing features and user-facing behavior relevant to the new idea
   - UI patterns, screens, and flows the user already experiences
   Use tools like Glob, Grep, and Read to explore. Focus on understanding the product from a USER perspective, not the technical internals.

2. **ASK CLARIFYING QUESTIONS**: After exploring, ask the user questions to deeply understand the product vision. Do NOT try to write the document immediately. Ask about:
   - **Target users**: Who exactly is this for? What are their pain points today?
   - **Core problem**: What specific problem does this solve? Why do existing solutions fail?
   - **Key use cases**: Walk through 3-5 primary user scenarios in detail
   - **Scope & boundaries**: What is explicitly OUT of scope for v1? What's the MVP vs nice-to-have?
   - **Success metrics**: How will we measure if this product is successful?
   - **User experience**: What should the key flows feel like? Any strong opinions on UX?
   - **Timeline & priorities**: Is there a deadline? What's the priority order of features?
   - **Edge cases**: What happens in failure modes, empty states, or unusual inputs?
   Also ask codebase-informed questions about the PRODUCT (not technical details):
   - "I see the app currently does [X] for users. Should this new feature build on that or be separate?"
   - "The existing [feature] works like [Y]. How should this new feature relate to it from the user's perspective?"

3. **Ask questions in batches** of 3-5 at a time. Don't overwhelm with everything at once.
4. **After each round of answers**, ask follow-up questions to dig deeper into areas that are vague or important.
5. **Keep going until you have a thorough understanding.** You should typically do 2-4 rounds of questions before writing.
6. **When you have enough information**, tell the user you're ready to write the product scoping document, then write it to ./.trace/product-scoping.md.

## Writing the Product Scoping Document

When you have sufficient clarity, write to ./.trace/product-scoping.md

The document must follow this structure:

# [Product Name] — Product Scoping

## 1. Overview
Brief summary of what we're building and why.

## 2. Problem Statement
- What problem exists today
- Who is affected
- Why current solutions are inadequate

## 3. Target Users
- Primary personas with descriptions
- User segments and their specific needs

## 4. Goals & Success Metrics
- Primary goals
- Measurable success criteria (KPIs)
- What "done" looks like

## 5. User Stories & Use Cases
For each major use case:
- As a [user type], I want to [action], so that [benefit]
- Detailed flow description
- Acceptance criteria

## 6. Functional Requirements
### 6.1 [Feature Area]
- Detailed requirements with priority (P0/P1/P2)
- Behavior specifications
- Input/output expectations
(repeat subsections as needed)

## 7. Non-Functional Requirements
- Performance targets
- Security requirements
- Scalability considerations
- Accessibility requirements

## 8. UX/UI Requirements
- Key screens or flows
- Interaction patterns
- Design principles specific to this product

## 9. Scope & Constraints
### In Scope (v1)
### Out of Scope (v1)
### Known Constraints

## 10. Dependencies
- External systems or services
- Data requirements
- Other features this depends on

## 11. Risks & Mitigations
| Risk | Impact | Likelihood | Mitigation |

## 12. Open Questions
- Remaining items to resolve

## CRITICAL: What NOT to include

This is a PRODUCT scoping document. Do NOT include:
- Technical architecture, file paths, component names, or code references
- Implementation plans, database schemas, or API designs
- Which files to modify or create
- State management, framework choices, or code patterns
- Any "how to build it" details

Those belong in the Technical Scoping document which will be generated separately after this product scoping is complete. The technical scoping phase will read this document and the codebase to determine implementation details.

## Important rules

- You MUST only write to ./.trace/product-scoping.md. Do NOT create, edit, or delete any other file.
- You MAY read files to understand the product, but focus on user-facing behavior, not internals.
- Do NOT write the document until you have asked enough questions to deeply understand the product.
- Keep the document focused on WHAT and WHY, never on HOW.
- Use the user's actual answers to fill in every section with real detail — avoid generic filler text.
- After writing the first draft, ask the user if they want to revise any sections.
- If the user requests changes, update the file accordingly.
</trace-internal>

The user wants to create a product scoping document for the following idea:

${userPrompt}

Start by exploring the codebase to understand the existing product, then ask your first round of clarifying questions.`;
}

function buildTechScopePrompt(): string {
  return `<trace-internal>
You are a senior software architect and technical lead. Your job is to create a comprehensive Technical Scoping document that defines HOW to build what the provided PRD describes, based on deep analysis of the actual codebase.

## CRITICAL FILE RESTRICTION

You are allowed to WRITE to exactly ONE file: ./.trace/technical-scoping.md
You MUST NOT create, modify, or delete any other file in this repository. No exceptions.
You MAY and SHOULD read any file in the codebase to inform the technical scoping.

## Input PRD

The PRD is located at: ./.trace/product-scoping.md
Read this file FIRST before doing anything else.

## Your workflow

1. **READ THE PRD**: Start by reading the PRD file at ./.trace/product-scoping.md to understand what needs to be built.

2. **DEEP-EXPLORE THE CODEBASE**: Then thoroughly explore the codebase using Glob, Grep, and Read:
   - Map the full project structure and tech stack
   - Understand the architecture patterns (state management, component hierarchy, API layer)
   - Read existing implementations of similar features
   - Identify database models, GraphQL schemas, API endpoints
   - Understand the build system, testing patterns, and deployment setup
   - Read configuration files, type definitions, and shared utilities
   Spend significant effort here — the quality of the technical scoping depends on deep codebase understanding.

3. **ASK TARGETED TECHNICAL QUESTIONS**: After exploring, ask ONE round of 3-5 focused technical questions about:
   - Architecture choices and trade-offs (e.g., "Should we add a new Zustand store or extend an existing one?")
   - Integration points (e.g., "The current API uses X pattern — should we follow it or introduce Y?")
   - Performance considerations (e.g., "This feature will require real-time updates — WebSocket vs polling?")
   - Scope clarification on technical decisions the PRD leaves open
   Wait for the user's answers before proceeding.

4. **WRITE THE TECHNICAL SCOPING DOCUMENT** to ./.trace/technical-scoping.md with the following structure:

# Technical Scoping — [Feature Name]

## 1. Architecture Overview
- High-level architecture diagram (ASCII or description)
- How this feature fits into the existing system architecture
- Key architectural decisions and rationale

## 2. File-Level Implementation Plan
For each file that needs to be created or modified:
- **File path** (actual paths in the codebase)
- **Change type**: New file / Modify existing
- **Description**: What changes are needed and why
- **Estimated complexity**: Small / Medium / Large
Group by logical component (e.g., Backend, Frontend, Shared).

## 3. Data Model Changes
- New TypeScript interfaces/types (with actual field definitions)
- GraphQL schema additions or modifications
- Database schema changes (if applicable)
- Migration strategy

## 4. API Design
- New GraphQL queries/mutations/subscriptions (with signatures)
- REST endpoints (if any)
- Request/response shapes
- Error handling approach
- Reference existing API patterns in the codebase

## 5. Frontend Component Hierarchy
- Component tree for new UI elements
- Which existing components to extend vs. create new
- Props interfaces
- State management approach (which Zustand stores, new vs existing)
- Re-render optimization strategy

## 6. Testing Strategy
- Unit test coverage plan
- Integration test scenarios
- E2E test cases
- Test file locations (following existing patterns)

## 7. Implementation Sequence
Ordered list of implementation steps with:
- Step description
- Files involved
- Dependencies on other steps
- Can it be parallelized with other steps?
Arrange so that each step builds on the previous, and the feature can be tested incrementally.

## 8. Risks & Technical Debt
- Technical risks and mitigations
- Performance concerns
- Security considerations
- Potential technical debt being introduced
- Breaking changes or migration needs

## Important rules

- You MUST only write to ./.trace/technical-scoping.md. Do NOT create, edit, or delete any other file.
- You MAY and SHOULD read any file in the repo to inform the technical scoping.
- Do NOT write the document until you have asked your round of technical questions and received answers.
- Reference ACTUAL file paths, component names, function signatures, and patterns from the codebase.
- Be specific and actionable — every section should contain real implementation details, not generic guidance.
- Do NOT create tickets or break this into tasks — this is a scoping document only.
- After writing the first draft, ask the user if they want to revise any sections.
</trace-internal>

A PRD has been written and is available at ./.trace/product-scoping.md. Create a detailed technical scoping document that defines how to implement it.

Start by reading the PRD file, then deep-explore the codebase, then ask your targeted technical questions.`;
}

function buildTicketsPrompt(): string {
  return `<trace-internal>
You are a senior software engineer and project planner. Your job is to read the PRD and Technical Scoping documents and produce a set of parallelizable implementation tickets as a JSON file.

## CRITICAL FILE RESTRICTION

You are allowed to WRITE to exactly ONE file: ./.trace/tickets.json
You MUST NOT create, modify, or delete any other file in this repository. No exceptions.
You MAY and SHOULD read any file in the codebase to inform ticket creation.

## Input Documents

- PRD: ./.trace/product-scoping.md
- Technical Scoping: ./.trace/technical-scoping.md

Read BOTH files FIRST before doing anything else.

## Your workflow

1. **READ BOTH DOCUMENTS**: Start by reading the PRD and Technical Scoping documents to understand what needs to be built and how.

2. **EXPLORE THE CODEBASE**: Briefly explore the codebase to validate the technical scoping's file references and understand the current state.

3. **GENERATE TICKETS**: Break the implementation into small, focused, parallelizable tickets. Each ticket should be completable independently (given its dependencies are met).

4. **WRITE THE JSON FILE** to ./.trace/tickets.json with the following schema:

\`\`\`json
[
  {
    "id": "string — short kebab-case identifier (e.g. 'add-auth-store', 'update-api-schema')",
    "title": "string — concise human-readable title (e.g. 'Add authentication Zustand store', 'Update API schema with user types')",
    "body": "string — detailed markdown description of the ticket including:\n- What to implement\n- Which files to create or modify\n- Acceptance criteria\n- Any code snippets or patterns to follow\n- Completion goals: specific, verifiable conditions that define when this ticket is done",
    "dependencies": ["id1", "id2"]
  }
]
\`\`\`

## Ticket guidelines

- Each ticket should be a single, focused unit of work (1-4 hours of implementation)
- Minimize dependencies — maximize parallelism
- Order dependencies so that foundational changes (types, schemas, stores) come first
- The \`dependencies\` array lists ticket IDs that MUST be completed before this ticket can start
- Include enough detail in the \`body\` that an AI agent or developer can implement the ticket without additional context
- Every ticket's \`body\` MUST end with a "## Completion Goals" section listing specific, verifiable conditions that define when the ticket is done. These should be concrete and testable (not vague like "works correctly"), so that a reviewer or automated check can confirm completion.
- Reference ACTUAL file paths, component names, and patterns from the codebase
- Cover the full implementation — every file mentioned in the technical scoping should appear in at least one ticket
- Include testing tickets where appropriate

## STRICT OUTPUT FORMAT — NON-NEGOTIABLE

The output file MUST be a JSON array where every object has EXACTLY these 4 keys:
- \`id\` (string) — short kebab-case identifier
- \`title\` (string) — concise human-readable title
- \`body\` (string) — detailed markdown description
- \`dependencies\` (string[]) — list of ticket IDs this depends on

NO additional keys. NO different structure. NO wrapping object. The user may ask you to change ticket content (what goes in \`body\`) but NEVER change the schema. If the user asks for extra fields, columns, metadata, or a different format, politely decline and explain the format is fixed. Always output a plain JSON array of {id, title, body, dependencies} objects.

## Important rules

- You MUST only write to ./.trace/tickets.json. Do NOT create, edit, or delete any other file.
- You MAY and SHOULD read any file in the repo to inform ticket creation.
- Do NOT ask questions — generate the tickets directly based on the two input documents.
- After writing the file, briefly summarize the ticket breakdown to the user.
</trace-internal>

A PRD and Technical Scoping document have been written. Read both from ./.trace/product-scoping.md and ./.trace/technical-scoping.md, then generate implementation tickets as JSON to ./.trace/tickets.json.`;
}

export default function App() {
  return (
    <ChannelProvider>
      <AppContent />
    </ChannelProvider>
  );
}

function AppContent() {
  const {
    servers,
    activeServerId,
    activeServer,
    switchServer,
    refreshServers,
    enrichedChannels,
    serverChannels,
    activeChannelId,
    enrichedActiveChannel,
    switchChannel,
    refreshChannels,
    localConfigs,
    getLocalConfig,
    setLocalConfig,
    updateChannelSettings,
    deleteChannel,
  } = useChannelContext();

  // ─── Zustand store state ───────────────────────────────────────────
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspacesLoading = useWorkspaceStore((s) => s.loading);
  const attentionWorkspaceIds = useWorkspaceStore(
    (s) => s.attentionWorkspaceIds,
  );
  const mergedCount = useWorkspaceStore((s) => s.mergedCount);
  const mergedWorkspacesLoaded = useWorkspaceStore(
    (s) => s.mergedWorkspacesLoaded,
  );
  const mergedWorkspacesLoading = useWorkspaceStore(
    (s) => s.mergedWorkspacesLoading,
  );

  const selectedWorkspaceId = useThreadStore((s) => s.selectedWorkspaceId);

  const workspacesWithRunningProcesses = useTerminalStore(
    (s) => s.workspacesWithRunningProcesses,
  );

  const kanbanColumns = useKanbanStore((s) => s.columns);
  const kanbanLoading = useKanbanStore((s) => s.loading);

  const middlePanelView = useAppUIStore((s) => s.middlePanelView);
  const channelWidth = useAppUIStore((s) => s.channelWidth);
  const isFullscreen = useAppUIStore((s) => s.isFullscreen);
  const settingsChannelId = useAppUIStore((s) => s.settingsChannelId);
  const joinChannelId = useAppUIStore((s) => s.joinChannelId);
  const createChannelType = useAppUIStore((s) => s.createChannelType);
  const showCreateServer = useAppUIStore((s) => s.showCreateServer);
  const showProductDocModal = useAppUIStore((s) => s.showProductDocModal);
  const showNewWorkspaceModal = useAppUIStore((s) => s.showNewWorkspaceModal);
  const activeProductDocId = useAppUIStore((s) => s.activeProductDocId);
  const activeAiChatId = useAppUIStore((s) => s.activeAiChatId);
  const aiChats = useAppUIStore((s) => s.aiChats);
  const dragging = useAppUIStore((s) => s.dragging);

  const activeRunWorkspaceIds = useAgentRunStore(
    (s) => s.activeRunWorkspaceIds,
  );

  const { user: authUser } = useAuth();
  const authUserIdRef = useRef<string | null>(null);
  authUserIdRef.current = authUser?.id ?? null;

  // ─── Stable channel ref for callbacks ──────────────────────────────
  const activeChannelRef = useRef<Channel | null>(null);
  activeChannelRef.current = enrichedActiveChannel;

  const getChannelRepoPath = useCallback(
    () => activeChannelRef.current?.localRepoPath ?? "",
    [],
  );
  const getChannelBaseBranch = useCallback(
    () => activeChannelRef.current?.baseBranch ?? "main",
    [],
  );
  const getActiveChannelId = useCallback(
    () => activeChannelId,
    [activeChannelId],
  );

  // ─── Bridge hooks (GraphQL → stores) ──────────────────────────────
  const { refreshWorkspaces, loadMergedWorkspaces } = useWorkspaceSync();
  const { fetchBoard, moveTicket } = useKanbanSync();
  const {
    fetchAiChats,
    createAiChat,
    deleteAiChat: deleteAiChatMutation,
  } = useAiChatSync();

  // Thread sync — registers sync actions on threadStore
  useThreadSync(getActiveChannelId, getChannelRepoPath, getChannelBaseBranch);

  // Terminal PTY exit listener
  useTerminalInit();

  // ─── Panel resize ─────────────────────────────────────────────────
  usePanelResize();

  // ─── Mutations ────────────────────────────────────────────────────
  const [executeUpdateWorkspaceStatus] = useUpdateWorkspaceStatusMutation();
  const [executeDeleteWorkspace] = useDeleteWorkspaceMutation();
  const [executeSetWorkspacePrUrl] = useSetWorkspacePrUrlMutation();
  const [executeCreateWorkspace] = useCreateWorkspaceMutation();
  const [pullingPRNumbers, setPullingPRNumbers] = useState<Set<number>>(
    new Set(),
  );
  // ─── Notification permission ──────────────────────────────────────
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  // ─── Detect available agents on mount ──────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        const result = await window.traceAPI.detectAgents();
        if (result.success && result.agents) {
          useAgentRunStore.getState().setDetectedAgents(result.agents);
        }
      } catch {
        // Detection failed — keep default fallback agents
      }
    })();
  }, []);

  // ─── Upsert + sync helper ─────────────────────────────────────────
  const upsertAndSyncWorkspace = useCallback((workspace: Workspace) => {
    useWorkspaceStore.getState().upsertWorkspace(workspace);
    useThreadStore.getState().syncSelectedWorkspace(workspace);
  }, []);

  // ─── Check worktree existence for merged workspaces ───────────────
  useEffect(() => {
    const repoPath = getChannelRepoPath();
    if (!repoPath || !window.traceAPI?.checkWorktreeExists) return;

    const mergedWorkspaces = workspaces.filter((ws) => ws.status === "merged");
    if (mergedWorkspaces.length === 0) {
      const prev = useWorkspaceStore.getState().worktreeWorkspaceIds;
      if (prev.size > 0)
        useWorkspaceStore.getState().setWorktreeWorkspaceIds(new Set());
      return;
    }

    let cancelled = false;
    void (async () => {
      const ids = new Set<string>();
      for (const ws of mergedWorkspaces) {
        try {
          const result = await window.traceAPI.checkWorktreeExists(
            ws.id,
            repoPath,
          );
          if (result.success && result.exists) ids.add(ws.id);
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) useWorkspaceStore.getState().setWorktreeWorkspaceIds(ids);
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaces, getChannelRepoPath]);

  // ─── Attention / notifications ────────────────────────────────────
  const recentToastsRef = useRef<Record<string, number>>({});
  const openWorkspaceRef = useRef<(ws: Workspace) => void>(() => {});
  const handleNeedsAttention = useCallback(
    (
      workspaceId: string,
      reason:
        | "stopped"
        | "ask-user-question"
        | "completed"
        | "merged"
        | "needs_input",
    ) => {
      // Only glow for the current user's own workspaces
      const workspace = useWorkspaceStore
        .getState()
        .workspaces.find((item) => item.id === workspaceId);
      if (
        workspace &&
        authUserIdRef.current &&
        workspace.userId !== authUserIdRef.current
      )
        return;
      useWorkspaceStore.getState().addAttention(workspaceId);

      // In-app toast for non-stopped reasons
      if (reason !== "stopped") {
        const now = Date.now();
        const lastToast = recentToastsRef.current[workspaceId] ?? 0;
        if (now - lastToast >= 3000) {
          recentToastsRef.current[workspaceId] = now;
          const TOAST_CONFIG: Record<
            string,
            { title: string; icon: React.ReactNode }
          > = {
            completed: {
              title: "Chat completed",
              icon: <FiCheckCircle className="text-green-400" />,
            },
            merged: {
              title: "Branch merged",
              icon: <FiGitMerge className="text-purple-400" />,
            },
            needs_input: {
              title: "Input needed",
              icon: <FiAlertCircle className="text-yellow-400" />,
            },
            "ask-user-question": {
              title: "Input needed",
              icon: <FiAlertCircle className="text-yellow-400" />,
            },
          };
          const config = TOAST_CONFIG[reason] ?? {
            title: "Chat completed",
            icon: <FiCheckCircle className="text-green-400" />,
          };
          const ws = useWorkspaceStore
            .getState()
            .workspaces.find((item) => item.id === workspaceId);
          const description = ws?.preview || ws?.cliSession.cwd || workspaceId;
          toast(config.title, {
            description: <ExpandableText text={description} lineClamp={2} />,
            icon: config.icon,
            duration: 8000,
            action: {
              label: "View",
              onClick: () => {
                const freshWs = useWorkspaceStore
                  .getState()
                  .workspaces.find((item) => item.id === workspaceId);
                if (freshWs) openWorkspaceRef.current(freshWs);
              },
            },
          });
        }
      }

      if (
        !document.hasFocus() &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        const NOTIFICATION_TITLES: Record<string, string> = {
          "ask-user-question": "Input needed",
          needs_input: "Input needed",
          merged: "Branch merged",
        };
        const title = NOTIFICATION_TITLES[reason] ?? "Chat completed";
        const workspace = useWorkspaceStore
          .getState()
          .workspaces.find((item) => item.id === workspaceId);
        const body =
          workspace?.preview || workspace?.cliSession.cwd || workspaceId;
        const notification = new Notification(title, { body });
        notification.onclick = () => {
          void window.traceAPI.focusWindow();
        };
      }
    },
    [],
  );

  // ─── Update workspace status mutation ─────────────────────────────
  const updateWorkspaceStatus = useCallback(
    async (workspaceId: string, status: TicketStatus) => {
      if (!activeChannelId) return;
      try {
        const { data } = await executeUpdateWorkspaceStatus({
          variables: { channelId: activeChannelId, workspaceId, status },
        });
        if (!data) return;
        upsertAndSyncWorkspace(data.updateWorkspaceStatus as Workspace);
      } catch {
        console.error("Failed to update workspace status");
      }
    },
    [activeChannelId, executeUpdateWorkspaceStatus, upsertAndSyncWorkspace],
  );

  // ─── Persist PR URL mutation ─────────────────────────────────────
  const persistPrUrl = useCallback(
    async (workspaceId: string, prUrl: string) => {
      if (!activeChannelId) return;
      try {
        await executeSetWorkspacePrUrl({
          variables: { channelId: activeChannelId, workspaceId, prUrl },
        });
        useKanbanStore.getState().setTicketWorkspacePrUrl(workspaceId, prUrl);
      } catch {
        // Silent — best-effort persistence
      }
    },
    [activeChannelId, executeSetWorkspacePrUrl],
  );

  // ─── Sync polling (main branch + PR statuses) ───────────────────
  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;
  const { triggerSync } = useSyncPolling({
    workspacesRef,
    getChannelId: getActiveChannelId,
    getRepoPath: getChannelRepoPath,
    getBaseBranch: getChannelBaseBranch,
    updateWorkspaceStatus,
    persistPrUrl,
  });

  // ─── Open workspace handler ───────────────────────────────────────
  const handleOpenWorkspace = useCallback((workspace: Workspace) => {
    useThreadStore.getState().syncActions.openThreadPanel(workspace);
    const chId = activeChannelRef.current?.id;
    if (chId) {
      useAppUIStore.getState().setChannelView(chId, "workspaces");
    } else {
      useAppUIStore.getState().setMiddlePanelView("workspaces");
    }
    useWorkspaceStore.getState().clearAttention(workspace.id);
  }, []);
  openWorkspaceRef.current = handleOpenWorkspace;

  // ─── Workspace actions (registers on agentRunStore) ────────────────
  useWorkspaceActions({
    updateWorkspaceStatus,
    onWorkspaceCreated: handleOpenWorkspace,
  });

  // ─── Reconcile stuck workspace statuses on startup ────────────────
  useStuckWorkspaceReconciliation({
    workspaces,
    workspacesLoading,
    updateWorkspaceStatus,
  });

  // ─── Subscriptions ───────────────────────────────────────────────
  const reportAgentActivity = useCallback(
    (workspaceId: string, eventType: string, sessionId?: string) =>
      useThreadStore
        .getState()
        .syncActions.reportAgentActivity(workspaceId, eventType, sessionId),
    [],
  );

  const autoRunRef = useRef<
    ((workspaceId: string, runConfig: unknown) => void) | null
  >(null);
  useEffect(() => {
    autoRunRef.current = (workspaceId: string, runConfig: unknown) => {
      const config = runConfig as {
        prompt: string;
        model: string;
        effort: string;
        planMode: boolean;
      };
      void useAgentRunStore
        .getState()
        .workspaceActions.autoRunQueuedTicket(workspaceId, config);
    };
  }, []);

  const { subscriptionsActive } = useChannelSubscriptions({
    activeChannelId,
    reportAgentActivity,
    onNeedsAttention: handleNeedsAttention,
    onTicketReadyToRun: useCallback(
      (workspaceId: string, runConfig: unknown) => {
        autoRunRef.current?.(workspaceId, runConfig);
      },
      [],
    ),
    onWorkspaceCompleted: triggerSync,
    refreshWorkspaces,
  });

  // ─── Presence tracking ──────────────────────────────────────────
  usePresenceReporter(activeChannelId);
  usePresenceSubscription(activeChannelId);

  const switchChannelRef = useRef<(channelId: string) => void>(() => {});
  const { unreadCounts } = useChannelMessageNotifications({
    activeServerId,
    activeChannelId,
    activeAiChatId,
    serverChannels,
    onNavigateToChannel: useCallback(
      (channelId: string) => switchChannelRef.current(channelId),
      [],
    ),
  });

  // ─── Channel/view switching ──────────────────────────────────────
  const handleSetView = useCallback(
    (view: MiddlePanelView) => {
      if (activeChannelId) {
        useAppUIStore.getState().setChannelView(activeChannelId, view);
      } else {
        useAppUIStore.getState().setMiddlePanelView(view);
      }
      if (view === "board" && activeChannelId) void fetchBoard(activeChannelId);
    },
    [activeChannelId, fetchBoard],
  );

  const handleMoveTicket = useCallback(
    (ticketId: string, columnId: string, sortOrder: number) => {
      if (!activeChannelId) return;
      void moveTicket(activeChannelId, ticketId, columnId, sortOrder);
    },
    [activeChannelId, moveTicket],
  );

  const handleDeleteWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!activeChannelId) return;
      if (!window.confirm("Delete this workspace?")) return;

      if (useThreadStore.getState().selectedWorkspaceId === workspaceId) {
        useThreadStore.getState().closeThreadPanel();
      }

      try {
        await executeDeleteWorkspace({
          variables: { channelId: activeChannelId, workspaceId },
        });
        useWorkspaceStore.getState().removeWorkspace(workspaceId);
        useKanbanStore.getState().removeTicketByWorkspaceId(workspaceId);
        useTerminalStore.getState().killAllForWorkspace(workspaceId);
        usePanelLayoutStore.getState().clearSavedLayout(workspaceId);
        void window.traceAPI.releasePorts(workspaceId);
        void window.traceAPI.deleteWorktree(workspaceId, getChannelRepoPath());
      } catch {
        console.error("Failed to delete workspace");
      }
    },
    [activeChannelId, executeDeleteWorkspace, getChannelRepoPath],
  );

  const handleMarkMerged = useCallback(
    async (workspaceId: string) => {
      await updateWorkspaceStatus(workspaceId, "merged");
    },
    [updateWorkspaceStatus],
  );

  const handleExpandMerged = useCallback(() => {
    if (activeChannelId) void loadMergedWorkspaces(activeChannelId);
  }, [activeChannelId, loadMergedWorkspaces]);

  const performChannelSwitch = useCallback(
    (channelId: string) => {
      const currentSelected = useThreadStore.getState().selectedWorkspaceId;
      if (currentSelected) void window.traceAPI.releasePorts(currentSelected);

      // Save current channel's view before switching
      const uiState = useAppUIStore.getState();
      if (activeChannelId) {
        uiState.setChannelView(activeChannelId, uiState.middlePanelView);
      }

      useAppUIStore.getState().setActiveAiChatId(null);
      switchChannel(channelId);
      useKanbanStore.getState().clearBoard();
      useWorkspaceStore.getState().clearWorkspaces();
      useKanbanStore.getState().setLoading(true);
      useSyncStore.getState().reset();
      usePresenceStore.getState().clear();

      // Restore saved view for target channel (validated)
      const savedView = useAppUIStore.getState().channelViewMap[channelId];
      const targetChannel = enrichedChannels.find((ch) => ch.id === channelId);
      const targetType = targetChannel?.type ?? "channel";
      const targetWsEnabled = targetChannel?.workspacesEnabled ?? false;
      const restoredView =
        savedView &&
        isViewValidForChannel(savedView, targetType, targetWsEnabled)
          ? savedView
          : getDefaultViewForChannel(targetType, targetWsEnabled);
      useAppUIStore.getState().setMiddlePanelView(restoredView);

      if (restoredView === "board") void fetchBoard(channelId);

      useThreadStore.getState().closeThreadPanel();
      useTerminalStore.getState().detachAll();
    },
    [switchChannel, activeChannelId, enrichedChannels, fetchBoard],
  );

  const handleSwitchChannel = useCallback(
    (channelId: string) => {
      performChannelSwitch(channelId);
    },
    [performChannelSwitch],
  );
  switchChannelRef.current = handleSwitchChannel;

  // ─── Thread link navigation (cross-channel support) ────────────────
  const handleOpenThreadLink = useCallback(
    (targetChannelId: string, workspaceId: string) => {
      if (targetChannelId === activeChannelId) {
        const ws = useWorkspaceStore
          .getState()
          .workspaces.find((w) => w.id === workspaceId);
        if (ws) handleOpenWorkspace(ws);
        return;
      }
      useAppUIStore
        .getState()
        .setPendingThreadOpen({ channelId: targetChannelId, workspaceId });
      performChannelSwitch(targetChannelId);
    },
    [activeChannelId, handleOpenWorkspace, performChannelSwitch],
  );

  const handleJoinChannel = useCallback(
    async (config: LocalChannelConfig) => {
      const targetId = joinChannelId ?? activeChannelId;
      if (!targetId) return;
      try {
        await setLocalConfig(targetId, config);
        useAppUIStore.getState().setJoinChannelId(null);
      } catch (err) {
        console.error("[App] Failed to save local config:", err);
      }
    },
    [joinChannelId, activeChannelId, setLocalConfig],
  );

  const handleSwitchServer = useCallback(
    (serverId: string) => {
      if (serverId === activeServerId) {
        useAppUIStore
          .getState()
          .setChannelWidth(useAppUIStore.getState().channelWidth > 0 ? 0 : 220);
        return;
      }
      switchServer(serverId);
      useAppUIStore.getState().setChannelWidth(220);
      const firstChannel = enrichedChannels.find(
        (ch) => ch.serverId === serverId,
      );
      if (firstChannel) handleSwitchChannel(firstChannel.id);
    },
    [switchServer, enrichedChannels, handleSwitchChannel, activeServerId],
  );

  const handleSwitchAiChat = useCallback((chatId: string) => {
    useAppUIStore.getState().setActiveAiChatId(chatId);
    useThreadStore.getState().closeThreadPanel();
    useAppUIStore.getState().setChannelWidth(220);
  }, []);

  const handleCreateAiChat = useCallback(async () => {
    if (!activeServerId) return;
    try {
      const chat = await createAiChat(activeServerId);
      if (chat) {
        useAppUIStore.getState().setActiveAiChatId(chat.id);
        useThreadStore.getState().closeThreadPanel();
        useAppUIStore.getState().setChannelWidth(220);
      }
    } catch (err) {
      console.error("[App] handleCreateAiChat failed:", err);
    }
  }, [activeServerId, createAiChat]);

  const handleRunProductDoc = useCallback(
    async (prompt: string) => {
      if (!activeChannelId) return;
      const repoPath = getChannelRepoPath();
      const baseBranch = getChannelBaseBranch();
      if (!repoPath) {
        console.error("[ProductDoc] No repo configured for this channel");
        return;
      }
      useAppUIStore.getState().setShowProductDocModal(false);

      try {
        // 1. Create a workspace to track the agent session
        const { data } = await executeCreateWorkspace({
          variables: {
            channelId: activeChannelId,
            text: `PRD: ${prompt.slice(0, 100)}`,
            isProductDoc: true,
          },
        });
        if (!data?.createWorkspace) {
          console.error("[ProductDoc] Failed to create workspace");
          return;
        }
        const workspace = data.createWorkspace.workspace as Workspace;
        upsertAndSyncWorkspace(workspace);

        // 2. Navigate to product doc workspace immediately
        const uiState = useAppUIStore.getState();
        uiState.setActiveProductDocId(workspace.id);
        uiState.setActiveAiChatId(null);
        uiState.setProductDocMode('prd');
        handleOpenWorkspace(workspace);

        // 3. Mark agent as running immediately so UI shows spinner
        useAgentRunStore.getState().addSpawnedWorkspace(workspace.id);
        useAgentRunStore.getState().addActiveRun(workspace.id);

        // 4. Build prompt & spawn agent with fixed path
        const agentPrompt = buildProductDocPrompt(prompt);
        const setupCommands = [
          // Ensure .trace/ is gitignored and untracked, then create the scoping file
          'grep -qxF ".trace/" .gitignore 2>/dev/null || echo ".trace/" >> .gitignore && ' +
          'git rm -r --cached .trace/ 2>/dev/null; ' +
          'git add .gitignore && ' +
          'git diff --cached --quiet || git commit -m "chore: gitignore .trace/" && ' +
          'mkdir -p .trace && touch .trace/product-scoping.md',
        ];

        window.traceAPI
          .spawnAgent(
            "claude",
            workspace.id,
            agentPrompt,
            repoPath,
            setupCommands,
            undefined, // resumeSessionId
            undefined, // filePaths
            "sonnet", // model
            undefined, // effort
            undefined, // systemInstructions (included in prompt)
            undefined, // permissionMode
            baseBranch,
          )
          .then((spawnResult) => {
            if (!spawnResult.success) {
              console.error("[ProductDoc] Spawn failed:", spawnResult.error);
              useAgentRunStore.getState().removeSpawnedWorkspace(workspace.id);
              useAgentRunStore.getState().clearActiveRun(workspace.id);
            }
          })
          .catch((err) => {
            console.error("[ProductDoc] Spawn error:", err);
            useAgentRunStore.getState().removeSpawnedWorkspace(workspace.id);
            useAgentRunStore.getState().clearActiveRun(workspace.id);
          });
      } catch (err) {
        console.error("[App] handleRunProductDoc failed:", err);
      }
    },
    [
      activeChannelId,
      executeCreateWorkspace,
      upsertAndSyncWorkspace,
      handleOpenWorkspace,
      getChannelRepoPath,
      getChannelBaseBranch,
    ],
  );

  const handleRunTechScope = useCallback(
    () => {
      const workspaceId = useAppUIStore.getState().activeProductDocId;
      if (!workspaceId) return;

      const repoPath = getChannelRepoPath();
      if (!repoPath) {
        console.error("[TechScope] No repo configured for this channel");
        return;
      }

      // Reset session state for a fresh Claude agent
      const store = useThreadStore.getState();
      store.setActiveSessionId(null);
      store.setSessionEvents([]);
      store.setSessionStatus('empty');

      // Switch to tech-scope mode and mark agent as running
      useAppUIStore.getState().setProductDocMode('tech-scope');
      useAgentRunStore.getState().addSpawnedWorkspace(workspaceId);
      useAgentRunStore.getState().addActiveRun(workspaceId);

      // Spawn a fresh agent in the same workspace (reuses worktree)
      const agentPrompt = buildTechScopePrompt();

      window.traceAPI
        .spawnAgent(
          "claude",
          workspaceId,
          agentPrompt,
          repoPath,
          ['mkdir -p .trace && touch .trace/technical-scoping.md'],
          undefined, // no resumeSessionId — fresh agent
          undefined,
          "sonnet",
          undefined,
          undefined,
          undefined,
          getChannelBaseBranch(),
        )
        .then((spawnResult) => {
          if (!spawnResult.success) {
            console.error("[TechScope] Spawn failed:", spawnResult.error);
            useAgentRunStore.getState().removeSpawnedWorkspace(workspaceId);
            useAgentRunStore.getState().clearActiveRun(workspaceId);
          }
        })
        .catch((err) => {
          console.error("[TechScope] Spawn error:", err);
          useAgentRunStore.getState().removeSpawnedWorkspace(workspaceId);
          useAgentRunStore.getState().clearActiveRun(workspaceId);
        });
    },
    [getChannelRepoPath, getChannelBaseBranch],
  );

  const handleRunTickets = useCallback(
    () => {
      const workspaceId = useAppUIStore.getState().activeProductDocId;
      if (!workspaceId) return;

      const repoPath = getChannelRepoPath();
      if (!repoPath) {
        console.error("[Tickets] No repo configured for this channel");
        return;
      }

      // Reset session state for a fresh Claude agent
      const store = useThreadStore.getState();
      store.setActiveSessionId(null);
      store.setSessionEvents([]);
      store.setSessionStatus('empty');

      // Switch to tickets mode and mark agent as running
      useAppUIStore.getState().setProductDocMode('tickets');
      useAgentRunStore.getState().addSpawnedWorkspace(workspaceId);
      useAgentRunStore.getState().addActiveRun(workspaceId);

      // Spawn a fresh agent in the same workspace (reuses worktree)
      const agentPrompt = buildTicketsPrompt();

      window.traceAPI
        .spawnAgent(
          "claude",
          workspaceId,
          agentPrompt,
          repoPath,
          ['mkdir -p .trace && touch .trace/tickets.json'],
          undefined, // no resumeSessionId — fresh agent
          undefined,
          "sonnet",
          undefined,
          undefined,
          undefined,
          getChannelBaseBranch(),
        )
        .then((spawnResult) => {
          if (!spawnResult.success) {
            console.error("[Tickets] Spawn failed:", spawnResult.error);
            useAgentRunStore.getState().removeSpawnedWorkspace(workspaceId);
            useAgentRunStore.getState().clearActiveRun(workspaceId);
          }
        })
        .catch((err) => {
          console.error("[Tickets] Spawn error:", err);
          useAgentRunStore.getState().removeSpawnedWorkspace(workspaceId);
          useAgentRunStore.getState().clearActiveRun(workspaceId);
        });
    },
    [getChannelRepoPath, getChannelBaseBranch],
  );

  const handleDeleteAiChat = useCallback(
    async (id: string) => {
      await deleteAiChatMutation(id);
      if (useAppUIStore.getState().activeAiChatId === id) {
        useAppUIStore.getState().setActiveAiChatId(null);
      }
    },
    [deleteAiChatMutation],
  );

  // ─── Pull PR into workspace ─────────────────────────────────────
  const handlePullPR = useCallback(
    async (pr: PullRequest) => {
      if (!activeChannelId) return;
      const repoPath = getChannelRepoPath();
      if (!repoPath) return;

      setPullingPRNumbers((prev) => new Set(prev).add(pr.number));

      let createdWorkspace: Workspace | null = null;
      try {
        // 1. Create workspace with PR title
        const { data } = await executeCreateWorkspace({
          variables: { channelId: activeChannelId, text: pr.title },
        });
        if (!data?.createWorkspace) {
          console.error("Failed to create workspace for PR");
          return;
        }
        const workspace = data.createWorkspace.workspace as Workspace;
        createdWorkspace = workspace;
        upsertAndSyncWorkspace(workspace);

        // 2. Checkout the PR branch into a worktree
        const setupScript = enrichedActiveChannel?.setupScript;
        const setupCommands = setupScript
          ? setupScript
              .split("\n")
              .map((l: string) => l.trim())
              .filter(Boolean)
          : [];
        const checkoutResult = await window.traceAPI.checkoutPullRequest(
          repoPath,
          pr.headRefName,
          workspace.id,
          setupCommands,
        );
        if (!checkoutResult.success) {
          throw new Error(checkoutResult.error || "Checkout failed");
        }

        // 3. Set PR URL on the workspace
        await executeSetWorkspacePrUrl({
          variables: {
            channelId: activeChannelId,
            workspaceId: workspace.id,
            prUrl: pr.url,
          },
        });
        useKanbanStore.getState().setTicketWorkspacePrUrl(workspace.id, pr.url);

        // 4. Switch to workspaces view and open the workspace
        handleOpenWorkspace(workspace);
        createdWorkspace = null; // success — don't clean up
      } catch (err) {
        console.error("Failed to pull PR:", err);
        // Clean up the workspace if it was created but checkout/setup failed
        if (createdWorkspace && activeChannelId) {
          try {
            await executeDeleteWorkspace({
              variables: {
                channelId: activeChannelId,
                workspaceId: createdWorkspace.id,
              },
            });
            useWorkspaceStore.getState().removeWorkspace(createdWorkspace.id);
          } catch {
            console.error(
              "Failed to clean up workspace after PR checkout failure",
            );
          }
        }
      } finally {
        setPullingPRNumbers((prev) => {
          const next = new Set(prev);
          next.delete(pr.number);
          return next;
        });
      }
    },
    [
      activeChannelId,
      enrichedActiveChannel,
      executeCreateWorkspace,
      executeDeleteWorkspace,
      executeSetWorkspacePrUrl,
      getChannelRepoPath,
      handleOpenWorkspace,
      upsertAndSyncWorkspace,
    ],
  );

  // ─── Channel-switch effects ──────────────────────────────────────
  useEffect(() => {
    if (activeChannelId) {
      void refreshWorkspaces(activeChannelId);
      void fetchBoard(activeChannelId);
      useTerminalStore.getState().reattach();
    }
  }, [activeChannelId, refreshWorkspaces, fetchBoard]);

  useEffect(() => {
    if (activeServerId) void fetchAiChats(activeServerId);
  }, [activeServerId, fetchAiChats]);

  // Fallback polling when subscriptions are down
  useEffect(() => {
    const interval = setInterval(() => {
      if (!activeChannelId || subscriptionsActive) return;
      if (useWorkspaceStore.getState().mergedWorkspacesLoaded) {
        void loadMergedWorkspaces(activeChannelId);
      } else {
        void refreshWorkspaces(activeChannelId);
      }
      const selectedWs = useThreadStore.getState().selectedWorkspace;
      if (selectedWs)
        void useThreadStore
          .getState()
          .syncActions.loadSessionEvents(selectedWs);
    }, 3000);
    return () => clearInterval(interval);
  }, [
    activeChannelId,
    refreshWorkspaces,
    loadMergedWorkspaces,
    subscriptionsActive,
  ]);

  // On WS reconnection (false → true), catch up on any missed updates
  const prevSubscriptionsActive = useRef(subscriptionsActive);
  useEffect(() => {
    if (
      subscriptionsActive &&
      !prevSubscriptionsActive.current &&
      activeChannelId
    ) {
      if (useWorkspaceStore.getState().mergedWorkspacesLoaded) {
        void loadMergedWorkspaces(activeChannelId);
      } else {
        void refreshWorkspaces(activeChannelId);
      }
      void fetchBoard(activeChannelId);
    }
    prevSubscriptionsActive.current = subscriptionsActive;
  }, [
    subscriptionsActive,
    activeChannelId,
    refreshWorkspaces,
    loadMergedWorkspaces,
    fetchBoard,
  ]);

  // One-time initial view correction after channel data loads
  const initialViewCorrectedRef = useRef(false);
  useEffect(() => {
    if (initialViewCorrectedRef.current || !enrichedActiveChannel) return;
    initialViewCorrectedRef.current = true;

    const { channelViewMap, middlePanelView } = useAppUIStore.getState();
    const savedView = channelViewMap[enrichedActiveChannel.id];
    const channelType = enrichedActiveChannel.type;
    const wsEnabled = enrichedActiveChannel.workspacesEnabled ?? false;

    if (savedView && isViewValidForChannel(savedView, channelType, wsEnabled))
      return;

    const correctView = getDefaultViewForChannel(channelType, wsEnabled);
    if (correctView !== middlePanelView) {
      useAppUIStore
        .getState()
        .setChannelView(enrichedActiveChannel.id, correctView);
    }
  }, [enrichedActiveChannel]);

  // Auto-open thread panel after cross-channel navigation
  useEffect(() => {
    const pending = useAppUIStore.getState().pendingThreadOpen;
    if (
      !pending ||
      pending.channelId !== activeChannelId ||
      workspaces.length === 0
    )
      return;
    const ws = workspaces.find((w) => w.id === pending.workspaceId);
    if (ws) handleOpenWorkspace(ws);
    useAppUIStore.getState().setPendingThreadOpen(null);
  }, [workspaces, activeChannelId, handleOpenWorkspace]);

  // Sync terminal selection with workspace selection, killing idle PTYs on navigate away
  const prevTerminalWorkspaceRef = useRef<string | null>(null);
  const killIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const prevId = prevTerminalWorkspaceRef.current;
    prevTerminalWorkspaceRef.current = selectedWorkspaceId;

    // selectWorkspace is cheap (synchronous projection) — run immediately
    useTerminalStore.getState().selectWorkspace(selectedWorkspaceId);

    // Debounce the IPC kill-idle call so rapid navigation doesn't fire it for every intermediate workspace
    if (killIdleTimerRef.current) clearTimeout(killIdleTimerRef.current);
    if (prevId && prevId !== selectedWorkspaceId) {
      const idToKill = prevId;
      killIdleTimerRef.current = setTimeout(() => {
        // Staleness guard: only kill if the user hasn't navigated back
        if (useThreadStore.getState().selectedWorkspaceId === idToKill) return;
        void useTerminalStore.getState().killIdleForWorkspace(idToKill);
      }, 300);
    }
  }, [selectedWorkspaceId]);
  useEffect(() => {
    return () => {
      if (killIdleTimerRef.current) clearTimeout(killIdleTimerRef.current);
    };
  }, []);

  // ─── Keyboard shortcuts ─────────────────────────────────────────
  useShortcuts();
  useShortcutContextSync();
  useDefaultShortcuts({
    serverChannels,
    handleSwitchChannel,
    handleOpenWorkspace,
  });

  // ─── Settings / channel modals ───────────────────────────────────
  const settingsChannel = useMemo(
    () =>
      enrichedChannels.find((channel) => channel.id === settingsChannelId) ??
      null,
    [enrichedChannels, settingsChannelId],
  );

  const joinChannel = useMemo(
    () =>
      enrichedChannels.find((channel) => channel.id === joinChannelId) ?? null,
    [enrichedChannels, joinChannelId],
  );

  const handleOpenSettings = useCallback((channelId: string) => {
    useAppUIStore.getState().setSettingsChannelId(channelId);
  }, []);

  const handleSaveSettings = useCallback(
    async (
      channelData: {
        name?: string;
        workspacesEnabled?: boolean;
        teamIds?: string[];
        defaultSetupScript?: string | null;
        defaultRunScript?: string | null;
      },
      localCfg: LocalChannelConfig | null,
    ) => {
      if (!settingsChannelId) return;
      await updateChannelSettings(settingsChannelId, channelData);
      if (localCfg) await setLocalConfig(settingsChannelId, localCfg);
      void refreshChannels();
    },
    [refreshChannels, settingsChannelId, updateChannelSettings, setLocalConfig],
  );

  const handleDeleteChannel = useCallback(
    async (channelId: string) => {
      const success = await deleteChannel(channelId);
      if (!success) return;
      useAppUIStore.getState().setSettingsChannelId(null);
      if (activeChannelId === channelId) {
        const remaining = serverChannels.filter((ch) => ch.id !== channelId);
        if (remaining.length > 0) switchChannel(remaining[0].id);
      }
      void refreshChannels();
    },
    [
      deleteChannel,
      activeChannelId,
      serverChannels,
      switchChannel,
      refreshChannels,
    ],
  );

  // ─── Computed values ─────────────────────────────────────────────
  const displayChannel = enrichedActiveChannel ?? serverChannels[0] ?? null;
  const panelTitle = displayChannel ? `# ${displayChannel.name}` : "";

  const needsJoin = !!(
    displayChannel?.workspacesEnabled &&
    displayChannel.githubUrl &&
    activeChannelId &&
    !localConfigs[activeChannelId]?.localRepoPath
  );

  const handleOpenJoinModal = useCallback(() => {
    if (activeChannelId)
      useAppUIStore.getState().setJoinChannelId(activeChannelId);
  }, [activeChannelId]);

  const teamProjects = useMemo(
    () =>
      displayChannel?.type === "team"
        ? serverChannels.filter(
            (ch) =>
              ch.type === "project" && ch.teamIds.includes(displayChannel.id),
          )
        : [],
    [displayChannel, serverChannels],
  );

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-primary">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ChannelPanel
          channels={serverChannels}
          activeChannelId={activeChannelId}
          channelWidth={isFullscreen ? 0 : channelWidth}
          dragging={dragging}
          servers={servers}
          activeServerId={activeServerId}
          activeServer={activeServer}
          onSwitchServer={handleSwitchServer}
          onCreateServer={() =>
            useAppUIStore.getState().setShowCreateServer(true)
          }
          aiChats={aiChats}
          activeAiChatId={activeAiChatId}
          unreadCounts={unreadCounts}
          localConfigs={localConfigs}
          onSwitchChannel={handleSwitchChannel}
          onCreateTeam={() =>
            useAppUIStore.getState().setCreateChannelType("team")
          }
          onCreateProject={() =>
            useAppUIStore.getState().setCreateChannelType("project")
          }
          onCreateChannel={() =>
            useAppUIStore.getState().setCreateChannelType("channel")
          }
          onSwitchAiChat={handleSwitchAiChat}
          onCreateAiChat={() => {
            void handleCreateAiChat();
          }}
          onDeleteAiChat={(id) => {
            void handleDeleteAiChat(id);
          }}
          onStartDrag={() => useAppUIStore.getState().setDragging("left")}
          onNewProductDoc={() =>
            useAppUIStore.getState().setShowProductDocModal(true)
          }
        />

        <div
          className="flex min-h-0 min-w-0 flex-col panel-animate"
          style={{ flex: "1 1 0%", overflow: "hidden" }}
        >
          {!isFullscreen && !activeAiChatId && !activeProductDocId && (
            <ChannelTopBar
              panelTitle={panelTitle}
              channelType={(displayChannel?.type ?? "project") as ChannelType}
              workspacesEnabled={displayChannel?.workspacesEnabled ?? true}
              middlePanelView={middlePanelView}
              onSetView={handleSetView}
              onOpenSettings={() => {
                if (displayChannel) handleOpenSettings(displayChannel.id);
              }}
              hasGithubUrl={!!displayChannel?.githubUrl}
              serverChannels={serverChannels}
              activeChannelId={activeChannelId}
              onSwitchChannel={handleSwitchChannel}
            />
          )}
          <div className="flex min-h-0 flex-1 flex-col">
            {activeProductDocId ? (
              <ProductDocView
                onBack={() => {
                  useAppUIStore.getState().setActiveProductDocId(null);
                  useAppUIStore.getState().setProductDocMode('prd');
                }}
                onGenerateTechScope={handleRunTechScope}
                onGenerateTickets={handleRunTickets}
              />
            ) : activeAiChatId ? (
              <AiChatPanel
                chatId={activeAiChatId}
                chatTitle={
                  aiChats.find((c) => c.id === activeAiChatId)?.title ??
                  "AI Chat"
                }
              />
            ) : (
              <MessagePanel
                panelTitle={panelTitle}
                channelId={activeChannelId}
                channelCreatedAt={enrichedActiveChannel?.createdAt ?? null}
                workspaces={workspaces}
                selectedWorkspaceId={selectedWorkspaceId}
                attentionWorkspaceIds={attentionWorkspaceIds}
                onOpenWorkspace={handleOpenWorkspace}
                onDeleteWorkspace={handleDeleteWorkspace}
                onMarkMerged={handleMarkMerged}
                middlePanelView={middlePanelView}
                kanbanColumns={kanbanColumns}
                kanbanLoading={kanbanLoading}
                onMoveTicket={handleMoveTicket}
                isFullscreen={isFullscreen}
                teamProjects={teamProjects}
                onSwitchChannel={handleSwitchChannel}
                workspacesWithRunningProcesses={workspacesWithRunningProcesses}
                activeRunWorkspaceIds={activeRunWorkspaceIds}
                needsJoin={needsJoin}
                onJoinChannel={handleOpenJoinModal}
                onOpenThreadLink={handleOpenThreadLink}
                repoPath={enrichedActiveChannel?.localRepoPath}
                onPullPR={handlePullPR}
                pullingPRNumbers={pullingPRNumbers}
                workspacesLoading={workspacesLoading}
                mergedCount={mergedCount}
                mergedWorkspacesLoaded={mergedWorkspacesLoaded}
                mergedWorkspacesLoading={mergedWorkspacesLoading}
                onExpandMerged={handleExpandMerged}
              />
            )}
          </div>
        </div>
      </div>

      {settingsChannel && (
        <ChannelSettingsModal
          channel={settingsChannel}
          teams={serverChannels.filter((ch) => ch.type === "team")}
          localConfig={getLocalConfig(settingsChannel.id)}
          onClose={() => useAppUIStore.getState().setSettingsChannelId(null)}
          onSave={handleSaveSettings}
          onDelete={handleDeleteChannel}
        />
      )}

      {joinChannel && (
        <JoinChannelModal
          channel={joinChannel}
          onJoined={handleJoinChannel}
          onCancel={() => useAppUIStore.getState().setJoinChannelId(null)}
        />
      )}

      {createChannelType && (
        <CreateChannelModal
          serverId={activeServerId}
          channelType={createChannelType}
          teams={serverChannels.filter((ch) => ch.type === "team")}
          onClose={() => useAppUIStore.getState().setCreateChannelType(null)}
          onCreated={() => {
            useAppUIStore.getState().setCreateChannelType(null);
            void refreshChannels();
          }}
          onLocalConfigSave={setLocalConfig}
        />
      )}

      {showCreateServer && (
        <CreateServerModal
          onClose={() => useAppUIStore.getState().setShowCreateServer(false)}
          onCreated={(server) => {
            useAppUIStore.getState().setShowCreateServer(false);
            void refreshServers();
            void refreshChannels();
            switchServer(server.id);
            if (server.channels.length > 0)
              handleSwitchChannel(server.channels[0].id);
          }}
        />
      )}

      {showProductDocModal && (
        <ProductDocModal
          hasRepo={!!enrichedActiveChannel?.localRepoPath}
          onClose={() =>
            useAppUIStore.getState().setShowProductDocModal(false)
          }
          onRun={(prompt) => {
            void handleRunProductDoc(prompt);
          }}
        />
      )}

      {showNewWorkspaceModal && <NewWorkspaceModal />}

      <ShortcutHelpDialog />
      <CommandPalette
        serverChannels={serverChannels}
        onSwitchChannel={handleSwitchChannel}
        onOpenThreadLink={handleOpenThreadLink}
      />
      <Toaster
        position="bottom-right"
        theme="dark"
        closeButton
        toastOptions={{ duration: 5000 }}
      />
    </div>
  );
}
