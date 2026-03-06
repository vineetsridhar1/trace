import type { MutationResolvers } from './../../../types.generated';
import { createServer as createServerService } from '../../../../services/serverService';

export const createServer: NonNullable<MutationResolvers['createServer']> = async (_parent, { name, avatarUrl }, _ctx) => {
  return createServerService({ name, avatarUrl: avatarUrl || null });
};
