import type { ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { AuthorizationError, NotFoundError, ValidationError } from "../lib/errors.js";
import { canViewSessionGroup } from "./access.js";
import { eventService } from "./event.js";

function normalizeBrowserUrl(value: string): string {
  const input = value.trim();
  if (!input) throw new ValidationError("Browser URL is required");
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new ValidationError("Browser URL is invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("Browser URL must use HTTP or HTTPS");
  }
  return url.toString();
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
