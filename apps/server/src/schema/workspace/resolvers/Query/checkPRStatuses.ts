import type { QueryResolvers } from './../../../types.generated';
import { GraphQLError } from 'graphql';
import prisma from '../../../../lib/prisma';
import { checkPRsForBranches } from '../../../../services/githubService';

export const checkPRStatuses: NonNullable<QueryResolvers['checkPRStatuses']> = async (_parent, { channelId, branches }, ctx) => {
  const user = (ctx as { user?: { id: string } }).user;
  if (!user) {
    throw new GraphQLError('Authentication required', { extensions: { code: 'UNAUTHENTICATED' } });
  }

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel?.githubUrl) {
    return [];
  }

  // Parse owner/repo from GitHub URL (e.g., https://github.com/owner/repo)
  const match = channel.githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    return [];
  }
  const [, repoOwner, repoName] = match;

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser?.githubAccessToken) {
    throw new GraphQLError('GitHub access token not found. Please re-authenticate with GitHub.', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }

  const results = await checkPRsForBranches(dbUser.githubAccessToken, repoOwner, repoName.replace(/\.git$/, ''), branches);

  // Persist PR URLs on workspace records so they survive app restarts
  const branchesWithUrls = branches.filter((b) => results[b]?.prUrl);
  if (branchesWithUrls.length > 0) {
    const workspaces = await prisma.workspace.findMany({
      where: { channelId, branch: { in: branchesWithUrls } },
      select: { id: true, branch: true, prUrl: true },
    });
    for (const ws of workspaces) {
      const url = results[ws.branch!]?.prUrl;
      if (url && ws.prUrl !== url) {
        await prisma.workspace.update({ where: { id: ws.id }, data: { prUrl: url } });
      }
    }
  }

  return branches.map((branch) => ({
    branch,
    hasPR: results[branch]?.hasPR ?? false,
    merged: results[branch]?.merged ?? false,
    prUrl: results[branch]?.prUrl ?? null,
  }));
};
