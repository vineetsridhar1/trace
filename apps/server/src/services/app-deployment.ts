import type { AppDeployment } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { AuthorizationError, ValidationError } from "../lib/errors.js";
import {
  appDeploymentDispatcher,
  type AppDeploymentDispatcher,
} from "./app-deployment-dispatcher.js";
import { canViewSessionGroup } from "./access.js";
import { eventService } from "./event.js";

export function publicAppDeployment(deployment: AppDeployment) {
  return {
    ...deployment,
    queuedAt: deployment.queuedAt.toISOString(),
    startedAt: deployment.startedAt?.toISOString() ?? null,
    completedAt: deployment.completedAt?.toISOString() ?? null,
    createdAt: deployment.createdAt.toISOString(),
    updatedAt: deployment.updatedAt.toISOString(),
  };
}

function deploymentSlug(group: { id: string; slug: string | null }): string {
  const base = (group.slug ?? "app")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "app"}-${group.id
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toLowerCase()}`;
}

export class AppDeploymentService {
  constructor(private readonly dispatcher: AppDeploymentDispatcher = appDeploymentDispatcher) {}

  async list(sessionGroupId: string, organizationId: string, userId: string) {
    const group = await prisma.sessionGroup.findFirst({
      where: { id: sessionGroupId, organizationId },
      select: { visibility: true, ownerUserId: true },
    });
    if (!group || !canViewSessionGroup(group, userId)) {
      throw new AuthorizationError("Not authorized for this session group");
    }
    return prisma.appDeployment.findMany({
      where: { sessionGroupId, organizationId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  async publish(sessionGroupId: string, organizationId: string, userId: string) {
    const group = await prisma.sessionGroup.findFirstOrThrow({
      where: { id: sessionGroupId, organizationId },
      select: {
        id: true,
        kind: true,
        ownerUserId: true,
        repoId: true,
        slug: true,
      },
    });
    await this.assertCanManage(group, organizationId, userId);
    if (group.kind !== "app" || !group.repoId) {
      throw new ValidationError("Only managed app sessions can be published");
    }
    const checkpoint = await prisma.gitCheckpoint.findFirst({
      where: { sessionGroupId, repoId: group.repoId },
      orderBy: [{ committedAt: "desc" }, { createdAt: "desc" }],
    });
    if (!checkpoint) {
      throw new ValidationError("Commit the app before publishing");
    }

    let deployment = await prisma.appDeployment.create({
      data: {
        organizationId,
        sessionGroupId,
        repoId: group.repoId,
        sourceCheckpointId: checkpoint.id,
        commitSha: checkpoint.commitSha,
        requestedByUserId: userId,
      },
    });
    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionGroupId,
      eventType: "app_deployment_queued",
      payload: { deployment: publicAppDeployment(deployment), sessionGroupId },
      actorType: "user",
      actorId: userId,
    });

    try {
      const dispatched = await this.dispatcher.enqueue({
        deploymentId: deployment.id,
        organizationId,
        sessionGroupId,
        repoId: group.repoId,
        checkpointId: checkpoint.id,
        commitSha: checkpoint.commitSha,
        appSlug: deploymentSlug(group),
        requestedAt: deployment.queuedAt.toISOString(),
      });
      if (dispatched.externalJobId) {
        deployment = await prisma.appDeployment.update({
          where: { id: deployment.id },
          data: { externalJobId: dispatched.externalJobId },
        });
      }
      return deployment;
    } catch (error) {
      deployment = await prisma.appDeployment.update({
        where: { id: deployment.id },
        data: {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        },
      });
      await eventService.create({
        organizationId,
        scopeType: "session",
        scopeId: sessionGroupId,
        eventType: "app_deployment_updated",
        payload: { deployment: publicAppDeployment(deployment), sessionGroupId },
        actorType: "system",
        actorId: "app-deployment-dispatcher",
      });
      throw error;
    }
  }

  private async assertCanManage(
    group: { ownerUserId: string },
    organizationId: string,
    userId: string,
  ) {
    if (group.ownerUserId === userId) return;
    const member = await prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { role: true },
    });
    if (member?.role !== "admin") {
      throw new AuthorizationError("Only the session owner or an org admin can publish apps");
    }
  }
}

export const appDeploymentService = new AppDeploymentService();
