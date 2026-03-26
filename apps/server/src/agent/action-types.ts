/**
 * Maps action names (from the planner/registry) to InboxItemType values.
 *
 * Extracted into its own module so both `suggestion.ts` and `policy-engine.ts`
 * can import it without creating a circular dependency.
 */

import type { InboxItemType } from "@prisma/client";

const ACTION_TO_ITEM_TYPE: Record<string, InboxItemType> = {
  "ticket.create": "ticket_suggestion",
  "ticket.update": "field_change_suggestion",
  "ticket.addComment": "comment_suggestion",
  "link.create": "link_suggestion",
  "session.start": "session_suggestion",
  "message.send": "message_suggestion",
};

export function mapActionToItemType(actionType: string): InboxItemType {
  return ACTION_TO_ITEM_TYPE[actionType] ?? "agent_suggestion";
}
