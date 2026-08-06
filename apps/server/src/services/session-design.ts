import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { ValidationError } from "../lib/errors.js";
import { createDeterministicTarGz, parseGitTreeArchive } from "../lib/design-system-archive.js";
import { designSourceSlug, isDesignSourcePath } from "../lib/design-source.js";
import { gitStorage } from "../lib/git-storage/index.js";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";
import { eventService } from "./event.js";

export type LinkedSessionDesign = {
  id: string;
  name: string;
  slug: string;
  commitSha: string;
  archivePath: string;
};

type LinkClient = Pick<Prisma.TransactionClient, "sessionGroupDesignLink">;

export class SessionDesignService {
  async link(
    input: {
      organizationId: string;
      implementationSessionGroupId: string;
      designSessionGroupId: string;
    },
    client: LinkClient = prisma,
  ): Promise<void> {
    await client.sessionGroupDesignLink.upsert({
      where: {
        implementationSessionGroupId_designSessionGroupId: {
          implementationSessionGroupId: input.implementationSessionGroupId,
          designSessionGroupId: input.designSessionGroupId,
        },
      },
      create: input,
      update: {},
    });
  }

  private async resolveCommitSha(
    organizationId: string,
    repoId: string,
    branch: string | null,
    previewCommitSha: string | null,
  ): Promise<string | null> {
    if (previewCommitSha) return previewCommitSha;
    if (branch) return gitStorage.getBranchHead(organizationId, repoId, branch);
    return null;
  }

  async listForInvocation(input: {
    organizationId: string;
    sessionId: string;
    invocationId: string;
  }): Promise<LinkedSessionDesign[]> {
    const session = await prisma.session.findFirst({
      where: {
        id: input.sessionId,
        organizationId: input.organizationId,
        activeInvocationId: input.invocationId,
      },
      select: { sessionGroupId: true },
    });
    if (!session?.sessionGroupId) {
      throw new ValidationError("The design invocation is no longer active");
    }

    const links = await prisma.sessionGroupDesignLink.findMany({
      where: {
        organizationId: input.organizationId,
        implementationSessionGroupId: session.sessionGroupId,
      },
      include: {
        designSessionGroup: {
          select: {
            id: true,
            name: true,
            slug: true,
            repoId: true,
            branch: true,
            designPreviewCommitSha: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const designs = await Promise.all(
      links.map(async ({ designSessionGroup: design }) => {
        if (!design.repoId) return null;
        const commitSha = await this.resolveCommitSha(
          input.organizationId,
          design.repoId,
          design.branch,
          design.designPreviewCommitSha,
        );
        if (!commitSha) return null;
        return {
          id: design.id,
          name: design.name,
          slug: designSourceSlug(design),
          commitSha,
          archivePath: `/agent/designs/${encodeURIComponent(design.id)}/archive`,
        };
      }),
    );
    return designs.filter((design): design is LinkedSessionDesign => design !== null);
  }

  async archiveForInvocation(input: {
    organizationId: string;
    sessionId: string;
    invocationId: string;
    designSessionGroupId: string;
  }): Promise<{ design: LinkedSessionDesign; archive: Buffer }> {
    const design = (await this.listForInvocation(input)).find(
      (candidate) => candidate.id === input.designSessionGroupId,
    );
    if (!design) throw new ValidationError("Design is not linked to this session");

    const source = await prisma.sessionGroup.findFirst({
      where: {
        id: design.id,
        organizationId: input.organizationId,
        kind: "design",
      },
      select: { repoId: true },
    });
    if (!source?.repoId) throw new ValidationError("Design source is unavailable");

    const tree = await parseGitTreeArchive(
      await gitStorage.archiveTreeAtCommit(input.organizationId, source.repoId, design.commitSha),
    );
    const files = new Map([...tree.files].filter(([path]) => isDesignSourcePath(path)));
    if (files.size === 0) throw new ValidationError("Design has no implementation source");
    const archive = await createDeterministicTarGz(files);

    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "session",
      scopeId: input.sessionId,
      eventType: "design_source_pulled",
      payload: {
        designSessionGroupId: design.id,
        name: design.name,
        slug: design.slug,
        commitSha: design.commitSha,
      },
      actorType: "agent",
      actorId: TRACE_AI_USER_ID,
    });

    return { design, archive };
  }
}

export const sessionDesignService = new SessionDesignService();
