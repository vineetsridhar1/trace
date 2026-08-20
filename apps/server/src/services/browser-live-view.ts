import { prisma } from "../lib/db.js";
import { AuthorizationError, NotFoundError } from "../lib/errors.js";
import { sessionRouter } from "../lib/session-router.js";
import { canViewSessionGroup } from "./access.js";

class BrowserLiveViewService {
  async frame(input: { sessionId: string; organizationId: string; userId: string }) {
    const session = await prisma.session.findFirst({
      where: { id: input.sessionId, organizationId: input.organizationId },
      select: {
        id: true,
        sessionGroup: { select: { visibility: true, ownerUserId: true } },
      },
    });
    if (!session) throw new NotFoundError("Session", input.sessionId);
    if (!session.sessionGroup || !canViewSessionGroup(session.sessionGroup, input.userId)) {
      throw new AuthorizationError("Not authorized to view this browser");
    }
    const runtime = sessionRouter.getRuntimeForSession(session.id);
    if (!runtime) throw new AuthorizationError("Browser is not connected to a runtime");
    return sessionRouter.captureBrowserLiveFrame(runtime.id, session.id);
  }
}

export const browserLiveViewService = new BrowserLiveViewService();
