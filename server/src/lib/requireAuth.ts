import { GraphQLError } from 'graphql';

export function requireAuth(ctx: unknown): { id: string; email: string; name: string } {
  const user = (ctx as { user?: { id: string; email: string; name: string } }).user;
  if (!user) {
    throw new GraphQLError('Authentication required', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  return user;
}
