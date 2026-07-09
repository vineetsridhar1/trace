/**
 * Tracks message IDs that were just sent by the current user so they can
 * animate in exactly once. `ChatComposer` marks the optimistic temp ID on
 * send; `ChatMessage` consumes it on mount to trigger a one-shot animation.
 */
const justSentIds = new Set<string>();

export function markJustSent(messageId: string): void {
  justSentIds.add(messageId);
}

/** Returns true (and clears the mark) if this message was just sent locally. */
export function consumeJustSent(messageId: string): boolean {
  return justSentIds.delete(messageId);
}
