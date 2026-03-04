import { useCallback } from "react";
import type { Workspace, ProductDocMode } from "../types";
import { useCreateWorkspaceMutation } from "./__generated__/useAgentMessageActions.generated";
import { useAppUIStore } from "../stores/appUIStore";
import { useAgentRunStore } from "../stores/agentRunStore";
import { useThreadStore } from "../stores/threadStore";

// ─── Prompt builders (pure functions) ──────────────────────────────────────

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

// ─── Hook ──────────────────────────────────────────────────────────────────

interface UseProductDocActionsOptions {
  getChannelRepoPath: () => string;
  getChannelBaseBranch: () => string;
  onOpenWorkspace: (workspace: Workspace) => void;
  upsertAndSyncWorkspace: (workspace: Workspace) => void;
}

export function useProductDocActions({
  getChannelRepoPath,
  getChannelBaseBranch,
  onOpenWorkspace,
  upsertAndSyncWorkspace,
}: UseProductDocActionsOptions) {
  const [executeCreateWorkspace] = useCreateWorkspaceMutation();
  const activeChannelId = useAppUIStore((s) => s.activeChannelId);

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
        onOpenWorkspace(workspace);

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
      onOpenWorkspace,
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

  const handleSwitchProductDocTab = useCallback(
    (mode: ProductDocMode) => {
      useAppUIStore.getState().setProductDocMode(mode);
      const targetSessionId = useAppUIStore.getState().productDocSessionMap[mode];
      if (targetSessionId) {
        void useThreadStore.getState().syncActions.switchSession(targetSessionId);
      } else {
        // No agent for this tab yet — show empty state
        useThreadStore.getState().setActiveSessionId(null);
        useThreadStore.getState().setSessionEvents([]);
        useThreadStore.getState().setSessionStatus('empty');
      }
    },
    [],
  );

  return {
    handleRunProductDoc,
    handleRunTechScope,
    handleRunTickets,
    handleSwitchProductDocTab,
  };
}
