/**
 * Maps action names (from the planner/registry) to InboxItemType values.
 *
 * Extracted into its own module so both `suggestion.ts` and `policy-engine.ts`
 * can import it without creating a circular dependency.
 */

import type { InboxItemType } from "@prisma/client";

const ACTION_TO_ITEM_TYPE: Record<string, InboxItemType> = {
  // Ticket actions
  "ticket.create": "ticket_suggestion",
  "ticket.update": "field_change_suggestion",
  "ticket.addComment": "comment_suggestion",
  "ticket.assign": "field_change_suggestion",
  "ticket.unassign": "field_change_suggestion",
  "ticket.link": "link_suggestion",
  "ticket.unlink": "link_suggestion",

  // Message actions (chat + channel)
  "message.send": "message_suggestion",
  "channel.sendMessage": "message_suggestion",
  "chat.editMessage": "message_suggestion",
  "chat.deleteMessage": "message_suggestion",
  "channel.editMessage": "message_suggestion",
  "channel.deleteMessage": "message_suggestion",

  // Session actions
  "session.start": "session_suggestion",
  "session.run": "session_suggestion",
  "session.sendMessage": "session_suggestion",
  "session.terminate": "session_suggestion",
  "session.dismiss": "session_suggestion",
  "session.delete": "session_suggestion",

  // Channel management
  "channel.update": "agent_suggestion",

  // Chat management
  "chat.create": "agent_suggestion",
  "chat.addMember": "agent_suggestion",
  "chat.rename": "agent_suggestion",

  // Project actions
  "project.create": "agent_suggestion",
  "project.linkEntity": "agent_suggestion",

  // Backward-compat aliases
  "message.sendToChannel": "message_suggestion",
  "link.create": "link_suggestion",
};

export function mapActionToItemType(actionType: string): InboxItemType {
  return ACTION_TO_ITEM_TYPE[actionType] ?? "agent_suggestion";
}
