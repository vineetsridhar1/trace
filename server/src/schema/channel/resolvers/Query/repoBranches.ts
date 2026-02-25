import type { QueryResolvers } from './../../../types.generated';
import { listBranches } from '../../../../services/gitService';

export const repoBranches: NonNullable<QueryResolvers['repoBranches']> = async (_parent, { localRepoPath }, _ctx) => {
  if (!localRepoPath) return [];
  return listBranches(localRepoPath);
};
