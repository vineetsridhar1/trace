import type { QueryResolvers } from './../../../types.generated';
import { validateGitRepo, getOriginRemoteUrl } from '../../../../services/gitService';

export const validateRepo: NonNullable<QueryResolvers['validateRepo']> = async (_parent, { localRepoPath }, _ctx) => {
  if (!localRepoPath) {
    return { valid: false, error: 'Path is required' };
  }

  const validation = await validateGitRepo(localRepoPath);
  if (!validation.valid) {
    return { valid: false, error: validation.error };
  }

  const originUrl = await getOriginRemoteUrl(localRepoPath);
  if (!originUrl) {
    return { valid: false, error: 'No origin remote found. Please add an origin remote to this repository.' };
  }

  return { valid: true, originUrl };
};
