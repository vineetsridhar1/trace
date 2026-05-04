import type { ActorType } from "@trace/gql";
import type { Playbook, PlaybookVersion, Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { assertActorOrgAccess } from "./actor-auth.js";

export const BUILT_IN_DEFAULT_PLAYBOOK_NAME = "Built-in default project autopilot";

export const DEFAULT_PLAYBOOK_CONTENT = [
  "Implement the current ticket in a normal coding-tool session.",
  "Review the implementation against the approved project plan and ticket acceptance criteria.",
  "Fix every review issue before progressing.",
  "Ask the human for QA when the work needs product judgment or manual validation.",
  "Apply user suggestions, then run review again.",
  "Create a PR only when implementation and review are complete.",
  "Merge only when service configuration and permissions allow it.",
].join("\n");

type PlaybookVersionWithPlaybook = PlaybookVersion & { playbook: Playbook };

export type ResolvedPlaybook = {
  source: "project_run" | "project" | "organization" | "built_in";
  playbook: Playbook;
  version: PlaybookVersion;
};

function snapshot(version: PlaybookVersionWithPlaybook): Prisma.InputJsonObject {
  return {
    playbook: {
      id: version.playbook.id,
      organizationId: version.playbook.organizationId,
      name: version.playbook.name,
      description: version.playbook.description,
      isBuiltIn: version.playbook.isBuiltIn,
    },
    version: {
      id: version.id,
      playbookId: version.playbookId,
      version: version.version,
      content: version.content,
      metadata: version.metadata,
      createdAt: version.createdAt.toISOString(),
    },
  };
}

export class PlaybookService {
  async resolveForProjectRun(
    projectRunId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ): Promise<ResolvedPlaybook> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<ResolvedPlaybook> => {
      await assertActorOrgAccess(tx, organizationId, actorType, actorId);
      const projectRun = await tx.projectRun.findFirstOrThrow({
        where: { id: projectRunId, organizationId },
        select: {
          playbookVersionId: true,
          project: { select: { defaultPlaybookVersionId: true } },
          organization: { select: { defaultPlaybookVersionId: true } },
        },
      });

      const candidates = [
        { source: "project_run" as const, id: projectRun.playbookVersionId },
        { source: "project" as const, id: projectRun.project.defaultPlaybookVersionId },
        { source: "organization" as const, id: projectRun.organization.defaultPlaybookVersionId },
      ];

      for (const candidate of candidates) {
        if (!candidate.id) continue;
        const version = await tx.playbookVersion.findUnique({
          where: { id: candidate.id },
          include: { playbook: true },
        });
        if (version) {
          return {
            source: candidate.source,
            playbook: version.playbook,
            version,
          };
        }
      }

      const builtIn = await this.ensureBuiltInDefault(tx);
      return {
        source: "built_in",
        playbook: builtIn.playbook,
        version: builtIn,
      };
    });
  }

  async snapshotForProjectRun(
    projectRunId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ): Promise<{ versionId: string; snapshot: Prisma.InputJsonObject; content: string }> {
    const resolved = await this.resolveForProjectRun(projectRunId, organizationId, actorType, actorId);
    const version = {
      ...resolved.version,
      playbook: resolved.playbook,
    } satisfies PlaybookVersionWithPlaybook;
    return {
      versionId: resolved.version.id,
      snapshot: snapshot(version),
      content: resolved.version.content,
    };
  }

  private async ensureBuiltInDefault(
    tx: Prisma.TransactionClient,
  ): Promise<PlaybookVersionWithPlaybook> {
    const existing = await tx.playbook.findFirst({
      where: { organizationId: null, name: BUILT_IN_DEFAULT_PLAYBOOK_NAME },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });

    if (existing && existing.versions[0]) {
      return { ...existing.versions[0], playbook: existing };
    }

    const playbook =
      existing ??
      (await tx.playbook.create({
        data: {
          organizationId: null,
          name: BUILT_IN_DEFAULT_PLAYBOOK_NAME,
          description: "Default guidance for sequential Trace project autopilot runs.",
          isBuiltIn: true,
        },
      }));

    const version = await tx.playbookVersion.create({
      data: {
        playbookId: playbook.id,
        version: 1,
        content: DEFAULT_PLAYBOOK_CONTENT,
        metadata: { kind: "project_autopilot_default_v1" },
      },
    });

    return { ...version, playbook };
  }
}

export const playbookService = new PlaybookService();
