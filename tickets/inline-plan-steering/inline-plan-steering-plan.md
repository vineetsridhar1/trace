# Inline Plan Steering Plan

## Status

Planned. Implement the web plan-review experience first. Add the mobile touch-first experience later as a separate pass.

## Goal

Allow users to steer a specific part of a plan-mode response without having to respond to the whole plan at once.

In the web session view, each readable top-level plan block should expose a hover or focus state. When active, the block shows a small `Steer` button in the top right of the block area. Clicking `Steer` unfurls an inline text input under that block, pushing the rest of the plan down. Sending the input asks the agent to revise only that selected part of the plan while staying in plan mode.

## Assumptions

- Scope for the first implementation is the web Trace session view.
- The first implementation should apply only to plan-review cards, not all Markdown surfaces.
- "Paragraph" means top-level rendered plan blocks that users naturally read as units: paragraphs, headings, lists, blockquotes, and code blocks.
- Nested list items should not each get their own steer controls in the first pass because that would make dense plans noisy.
- Inline steering sends another plan-mode message. It does not approve implementation.
- Mobile needs a touch-specific interaction model because hover does not exist and long-press is already useful for copy/text interactions.

## Current Code Context

- Web plan cards render through `apps/web/src/components/session/messages/PlanReviewCard.tsx`.
- The plan card currently delegates Markdown rendering to `apps/web/src/components/ui/Markdown.tsx`.
- Plan nodes are detected in `packages/client-core/src/session/nodes.ts`.
- Plan response actions already send plan-mode revisions through `apps/web/src/components/session/PlanResponseBar.tsx`.
- The session stream is virtualized in `apps/web/src/components/session/SessionMessageList.tsx`, so expanded inline controls must naturally change row height and let the virtualizer remeasure.

## Web Implementation Plan

### 1. Add Opt-In Steerable Markdown Rendering

Extend `apps/web/src/components/ui/Markdown.tsx` with optional steerable-block props.

Suggested shape:

```ts
interface MarkdownSteerBlock {
  id: string;
  markdown: string;
}

interface MarkdownProps {
  children: string;
  steerableBlocks?: boolean;
  onSteerBlock?: (block: MarkdownSteerBlock, feedback: string) => Promise<void> | void;
}
```

Default behavior must remain unchanged. Normal assistant messages, user messages, inbox cards, and settings Markdown should not gain hover states or steering controls.

Use `react-markdown` component overrides for top-level block elements. Keep existing file-aware link behavior intact.

### 2. Create A Focused Steerable Block Component

Add a small web component for the block chrome, likely under `apps/web/src/components/session/messages/`.

Responsibilities:

- Render the original Markdown block children.
- Add a subtle hover and keyboard-focus background/ring.
- Show a compact `Steer` button in the top right when hovered, focused, or expanded.
- Expand an inline textarea/input below the selected block.
- Include `Send` and close/cancel behavior.
- Disable send while empty or while the request is in flight.
- Preserve readable spacing so expanding one block pushes later plan content down cleanly.

Use existing UI patterns:

- `Button` from `components/ui/button`.
- `Textarea` from `components/ui/textarea`.
- `cn()` from `lib/utils`.
- `Send` from `lucide-react`.

### 3. Wire PlanReviewCard To Session Messaging

Update `PlanReviewCard` so it can send a scoped plan-mode revision.

Changes:

- Add `sessionId` to `PlanReviewCard` props.
- Pass `sessionId` from `SessionMessageList` when rendering `node.kind === "plan-review"`.
- Use `SEND_SESSION_MESSAGE_MUTATION` with `interactionMode: "plan"`.
- Keep the existing bottom `PlanResponseBar` untouched for whole-plan approval or broad revision.

Suggested message format:

```text
Please revise only this part of the plan:

<selected block markdown>

Feedback:
<user feedback>
```

This keeps the agent focused on the specific block while preserving enough context for a targeted plan revision.

### 4. Interaction Details

- Only one steer editor should be open per plan card at a time.
- Clicking another block's `Steer` button should move the editor to that block.
- `Escape` should collapse the active editor.
- `Cmd+Enter` or `Ctrl+Enter` should submit from the textarea.
- The send button is the primary visible action.
- The button label should remain `Steer`; the expanded submit button should say `Send`.
- Use stable block IDs derived from the block index and element type.
- Avoid storing this UI state in Zustand because it is local, transient presentation state.

### 5. Virtualized List Behavior

Because the session stream is virtualized:

- The expanded editor must be normal document flow, not an overlay.
- `SessionMessageList` should remeasure rows after inline expansion if the virtualizer does not pick up the height change automatically.
- Prefer a minimal callback from `PlanReviewCard` to trigger measurement only if needed after testing.

### 6. Styling

The visual design should match the dark Trace plan surface:

- Use a low-contrast hover background.
- Use the existing accent color only for focus, active, and send states.
- Keep the `Steer` button small and quiet.
- Use an 8px or smaller radius to match the existing interface.
- Make the hover area include the full block width so the top-right action feels anchored to the paragraph, not the text line.

### 7. Web Verification

Run:

```bash
pnpm --filter @trace/web lint
```

Manual verification in `pnpm dev:web`:

- Hovering a plan paragraph reveals `Steer`.
- Keyboard focusing a steerable block reveals the control.
- Clicking `Steer` expands the input below that block.
- Expanded input pushes subsequent plan content down.
- Empty feedback cannot be sent.
- Sending uses `interactionMode: "plan"`.
- Existing plan approval and broad revision still work.
- Non-plan Markdown surfaces are unchanged.

## Deferred Mobile Touch-First Design

Mobile should not copy the web hover behavior. Implement it later as a separate mobile pass.

### Mobile Goal

Let users steer a specific plan block in `apps/mobile/src/components/sessions/nodes/PlanReviewCard.tsx` with a touch-first interaction that does not conflict with scrolling, text reading, or existing copy affordances.

### Mobile Interaction Model

- Each top-level plan block gets a gentle press state, not a hover state.
- Tapping a block selects it and reveals a compact inline action row under that block.
- The action row contains a single primary `Steer` action.
- Tapping `Steer` expands a multiline input under the selected block.
- The keyboard should focus the input and the selected block should scroll enough to keep the input visible.
- Long-press should remain available for copy/context-menu behavior where it already exists.
- Only one block can be selected or expanded at a time.
- Tapping outside the active block collapses the inactive action row, but should not discard typed text without an explicit cancel action.

### Mobile Visual Design

- Use a larger touch target than web for the `Steer` action.
- Put the action row below the paragraph instead of in the top-right corner, because top-right controls are harder to hit and can obscure content on narrow screens.
- Use the existing mobile card, theme, and composer visual language.
- Avoid floating overlays for the input; keep the expanded editor in normal layout so it pushes content down.
- Keep copy and Markdown link behavior intact.

### Mobile Implementation Notes

- Extend the mobile Markdown renderer only in plan-review mode.
- Reuse the same conceptual block extraction as web if possible, but adapt it to `react-native-markdown-display` rules.
- Submit the same focused revision prompt shape as web.
- Send with `interactionMode: "plan"` so the agent remains in plan mode.
- Verify with real device dimensions because keyboard behavior and scroll anchoring are the main risks.

### Mobile Verification Later

- Tap a plan block and confirm the action row appears.
- Expand steering input and confirm the keyboard does not cover the input.
- Send focused feedback and confirm it remains in plan mode.
- Confirm long-press copy still works.
- Confirm scrolling dense plans remains smooth.

## Non-Goals

- Do not change backend event schema for this first implementation.
- Do not add broad plan editing or direct Markdown editing.
- Do not make all Markdown surfaces steerable.
- Do not implement mobile in the first web-focused pass.
- Do not add nested steer affordances for every list item until the simpler block-level interaction is proven.

