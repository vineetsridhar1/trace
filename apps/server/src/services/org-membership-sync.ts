import { prisma } from "../lib/db.js";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";
import { AUTO_JOIN_GITHUB_ORG, listGitHubOrgMemberIds } from "../lib/github-org.js";
import { orgMemberService } from "./org-member.js";

export type OrgMembershipReconcileResult = {
  skipped: boolean;
  removed: string[];
};

const SKIPPED: OrgMembershipReconcileResult = { skipped: true, removed: [] };

export class OrgMembershipSyncService {
  // Remove org members who are no longer part of AUTO_JOIN_GITHUB_ORG on GitHub.
  // Conservative by design: bails out (removing nobody) if the sync token is
  // missing, the GitHub listing fails, or the listing is empty — an org always
  // contains at least the token owner, so empty means a permissions/API problem.
  async reconcile(): Promise<OrgMembershipReconcileResult> {
    const token = process.env.GITHUB_ORG_SYNC_TOKEN?.trim();
    if (!token) return SKIPPED;

    const memberIds = await listGitHubOrgMemberIds(token, AUTO_JOIN_GITHUB_ORG);
    if (!memberIds || memberIds.size === 0) return SKIPPED;

    const organization = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!organization) return SKIPPED;

    const members = await prisma.orgMember.findMany({
      where: { organizationId: organization.id, userId: { not: TRACE_AI_USER_ID } },
      select: { userId: true, user: { select: { githubId: true } } },
    });

    const removed: string[] = [];
    for (const member of members) {
      const githubId = member.user.githubId;
      // Leave manually-added accounts (no GitHub identity) untouched; only reconcile
      // GitHub-authenticated members who have dropped out of the org.
      if (githubId == null || memberIds.has(githubId)) continue;
      try {
        await orgMemberService.removeMember({
          organizationId: organization.id,
          userId: member.userId,
          actorType: "system",
          actorId: "system",
        });
        removed.push(member.userId);
      } catch (error) {
        console.warn(
          `[org-membership-sync] failed to remove ${member.userId}: ${(error as Error).message}`,
        );
      }
    }

    return { skipped: false, removed };
  }
}

export const orgMembershipSyncService = new OrgMembershipSyncService();
