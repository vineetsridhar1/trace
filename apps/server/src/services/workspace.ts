import type { ActorType } from "@trace/gql";
import { normalizeWorkspaceBrowserUrl, WorkspaceBrowserUrlError } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { AuthorizationError, NotFoundError, ValidationError } from "../lib/errors.js";
import { canViewSessionGroup } from "./access.js";
import { eventService } from "./event.js";

function normalizeBrowserUrl(value: string): string {
  try {
    return normalizeWorkspaceBrowserUrl(value);
  } catch (error: unknown) {
    if (error instanceof WorkspaceBrowserUrlError) throw new ValidationError(error.message);
    throw error;
  }
}

class WorkspaceService {
  async openBrowser(input: {
    sessionGroupId: string;
    url: string;
    organizationId: string;
    userId: string;
    actorType: ActorType;
  }): Promise<boolean> {
    const group = await prisma.sessionGroup.findFirst({
      where: { id: input.sessionGroupId, organizationId: input.organizationId },
      select: { id: true, visibility: true, ownerUserId: true },
    });
    if (!group) throw new NotFoundError("Session group", input.sessionGroupId);
    if (!canViewSessionGroup(group, input.userId)) {
      throw new AuthorizationError("Not authorized for this session group");
    }

    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "system",
      scopeId: input.sessionGroupId,
      eventType: "workspace_browser_open_requested",
      payload: {
        sessionGroupId: input.sessionGroupId,
        targetUserId: input.userId,
        url: normalizeBrowserUrl(input.url),
      },
      actorType: input.actorType,
      actorId: input.userId,
    });
    return true;
  }
}

export const workspaceService = new WorkspaceService();
