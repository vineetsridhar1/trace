import type { QueryResolvers } from './../../../types.generated';

export const me: NonNullable<QueryResolvers['me']> = async (_parent, _arg, ctx) => {
  return (ctx as { user?: { id: string; email: string; name: string; avatarUrl: string | null; role: string; githubUsername: string | null } }).user ?? null;
};
