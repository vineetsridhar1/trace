interface PRInfo {
  hasPR: boolean;
  merged: boolean;
  prUrl?: string;
}

export async function checkPRsForBranches(
  githubAccessToken: string,
  repoOwner: string,
  repoName: string,
  branches: string[],
): Promise<Record<string, PRInfo>> {
  const results: Record<string, PRInfo> = {};

  for (const branch of branches) {
    try {
      const resp = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/pulls?head=${repoOwner}:${branch}&state=all&per_page=1`,
        {
          headers: {
            Authorization: `Bearer ${githubAccessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        },
      );

      if (!resp.ok) {
        results[branch] = { hasPR: false, merged: false };
        continue;
      }

      const prs = (await resp.json()) as Array<{ html_url: string; merged_at: string | null; state: string }>;
      if (prs.length === 0) {
        results[branch] = { hasPR: false, merged: false };
      } else {
        const pr = prs[0];
        results[branch] = {
          hasPR: true,
          merged: pr.merged_at !== null,
          prUrl: pr.html_url,
        };
      }
    } catch {
      results[branch] = { hasPR: false, merged: false };
    }
  }

  return results;
}
