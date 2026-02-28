import type { QueryResolvers } from './../../../types.generated';
import { generateText } from '../../../../services/aiService';

export const generateBranchName: NonNullable<QueryResolvers['generateBranchName']> = async (_parent, { prompt }) => {
  const name = await generateText({
    system:
      'Generate a short git branch name from the user\'s task description. ' +
      'Return ONLY the branch slug — lowercase, kebab-case, 2-5 words, no prefix. ' +
      'Examples: "fix-login-bug", "add-dark-mode", "refactor-auth-system", "update-sidebar-styles". ' +
      'Do NOT include any prefix like "trace/" or "feat/". Just the slug.',
    prompt,
    maxTokens: 30,
  });

  if (!name) return null;

  return name.replace(/^["']|["']$/g, '').trim().toLowerCase()
    .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || null;
};
