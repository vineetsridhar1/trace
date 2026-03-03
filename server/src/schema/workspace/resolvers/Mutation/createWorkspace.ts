import type { MutationResolvers } from "./../../../types.generated";
import { createUserWorkspace } from "../../../../services/workspaceService";
import { getChannel } from "../../../../services/channelService";
import { pubsub, TOPICS } from "../../../../services/pubsub";
import {
  createTicketForWorkspace,
  linkTicketToWorkspace,
} from "../../../../services/ticketService";

export const createWorkspace: NonNullable<MutationResolvers['createWorkspace']> = async (_parent, { channelId, text, attachmentIds, ticketId }, _ctx) => {
  const created = await createUserWorkspace(
    channelId,
    text.trim(),
    attachmentIds ?? undefined,
  );

  pubsub.publish(TOPICS.WORKSPACE_UPSERTED(channelId), {
    workspaceUpserted: created.workspace,
  });
  if (created.event) {
    pubsub.publish(TOPICS.SESSION_EVENT_CREATED(channelId), {
      sessionEventCreated: {
        channelId,
        workspaceId: created.workspace.id,
        sessionId: created.session.id,
        event: created.event,
      },
    });
  }

  if (ticketId) {
    // Link existing ticket to the new workspace
    void linkTicketToWorkspace(ticketId, created.workspace.id, channelId);
  } else if (text.trim()) {
    // Fire-and-forget: create a kanban ticket (skip for empty workspace creation)
    const channel = await getChannel(channelId);
    void createTicketForWorkspace(
      created.workspace.id,
      channelId,
      text.trim(),
      channel?.name ?? "general",
    );
  }

  return created;
};
