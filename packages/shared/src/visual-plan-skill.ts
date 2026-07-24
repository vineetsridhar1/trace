/**
 * Trace adaptation of Builder.io's MIT-licensed visual-plan skill.
 *
 * The upstream skill targets the Agent Native Plans MCP/local preview service.
 * Trace owns that transport itself, so this keeps the planning discipline and
 * replaces the publishing/tool instructions with Trace's watched plan.mdx
 * contract.
 */
export const TRACE_VISUAL_PLAN_SKILL = String.raw`
# Trace Visual Plans

Turn an implementation plan into a standalone, scannable review artifact. The
plan document is the source of truth. Chat is only for a short handoff after the
file is complete.

## Plan discipline

- Research before drafting. Read the real files, symbols, schemas, actions, and
  patterns. Planning is read-only: do not modify implementation files.
- Lead with reuse. For each step, say what existing code it reuses before what
  must be added.
- Decide hard-to-reverse choices first: public interfaces, identifiers, data
  shape, ownership, authorization, and migration boundaries.
- Preserve the user's level of abstraction. Examples clarify the architecture;
  they do not automatically become the whole architecture.
- Publish a standalone plan, never a conversation recap or revision memo.
- State assumptions. Put only genuinely unresolved, implementation-changing
  decisions in one Open Questions block at the bottom.
- The plan is the approval gate. Do not begin implementation until the user
  approves it.

## Document quality

Write a serious technical plan, not marketing copy. It must include:

1. An outcome-first title and overview that define what done means.
2. Scope and explicit non-goals.
3. The proposed approach and important decisions with rationale.
4. An implementation map grounded in real files and symbols.
5. Ordered implementation steps with specific behavior and data flow.
6. Risks, edge cases, rollout or compatibility concerns where relevant.
7. Verification that exercises the real workflow, not only type checking.

Use prose for the narrative and structured blocks where they materially improve
review. Do not pad a plan with decorative blocks. Architecture and backend plans
usually need a decision callout, a relationship diagram, a file map, and a
verification checklist. UI plans should describe the actual visible states and
transitions, while implementation details stay in the document.

## Trace MDX contract

Write Markdown plus the allowlisted paired components below. This is declarative
MDX: never use imports, exports, JavaScript expressions, scripts, styles,
iframes, arbitrary HTML, or self-authored component names.

- Callout: a settled decision, assumption, risk, or important constraint.
  Attributes: title, tone ("decision", "info", "warning", or "risk").
- Diagram: architecture, data flow, state transitions, or dependencies. Put one
  relationship per line as "Source -> Target: label".
- FileTree: the small, load-bearing file/symbol map. Use a tree-shaped plain-text
  body and annotate why each entry matters.
- Checklist: ordered implementation or verification work. Use Markdown task-list
  items in the body.
- QuestionForm: the only place for unresolved questions. Title it "Open
  Questions"; use Markdown headings and bullets, marking the recommended choice.
- Code: a compact planned interface or data-shape example. Attributes: title and
  language. The body is literal code, without a nested Markdown fence.
- Tabs: related alternatives or states that benefit from grouped review. Use
  Markdown headings inside the body.

Every plan must contain at least two appropriate structured blocks and one must
be a Checklist. A code-change plan must use FileTree. Use QuestionForm only when
there are real unresolved decisions; otherwise state that decisions are settled
in prose or a Callout.

Example:

# Improve session recovery

The session resumes from the latest durable checkpoint and reports a useful
failure when recovery is impossible.

<Callout title="Recovery boundary" tone="decision">
The service layer owns checkpoint selection; adapters only execute the resolved
resume command.
</Callout>

<Diagram title="Resume flow">
Web client -> Session service: request resume
Session service -> Event store: resolve checkpoint
Session service -> Session adapter: start runtime
Session adapter -> Web client: stream events
</Diagram>

<FileTree title="Implementation map">
apps/server/src/services/session.ts — recovery policy and emitted events
apps/server/src/lib/session-router.ts — hosting-mode dispatch
packages/shared/src/bridge.ts — provider-neutral bridge messages
</FileTree>

<Checklist title="Implementation and verification">
- [ ] Add the recovery policy at the service boundary.
- [ ] Cover missing and stale checkpoints.
- [ ] Resume a real stopped session and verify streamed output.
</Checklist>

## Handoff

Update the same file whenever feedback changes the plan. Re-read the complete
file before finishing. Do not paste the plan into chat; finish with only a brief
request for review and approval.
`;

export const TRACE_VISUAL_PLAN_BLOCK_NAMES = [
  "Callout",
  "Diagram",
  "FileTree",
  "Checklist",
  "QuestionForm",
  "Code",
  "Tabs",
] as const;

const VISUAL_PLAN_BLOCK_PATTERN =
  /<(Callout|Diagram|FileTree|Checklist|QuestionForm|Code|Tabs)\b[^>]*>[\s\S]*?<\/\1>/g;

export function validateTraceVisualPlan(content: string): string[] {
  const errors: string[] = [];
  const blocks = content.match(VISUAL_PLAN_BLOCK_PATTERN) ?? [];

  if (!/^#\s+\S/m.test(content)) errors.push("Add a level-one plan title.");
  if (blocks.length < 2) errors.push("Use at least two complete Trace visual-plan blocks.");
  if (!/<Checklist\b[^>]*>[\s\S]*?<\/Checklist>/.test(content)) {
    errors.push("Add a complete Checklist block.");
  }
  if (/^\s*(?:import|export)\s/m.test(content)) {
    errors.push("Imports and exports are not allowed.");
  }
  if (/<(?:script|style|iframe)\b/i.test(content)) {
    errors.push("Executable or embedded HTML is not allowed.");
  }

  return errors;
}
