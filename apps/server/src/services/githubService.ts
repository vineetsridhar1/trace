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

  if (branches.length === 0) {
    return results;
  }

  try {
    // Build a single GraphQL query with aliased fields per branch
    const aliasedFields = branches
      .map((branch, i) => {
        const alias = `pr_${i}`;
        const escapedBranch = branch.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `${alias}: pullRequests(headRefName: "${escapedBranch}", first: 1, states: [OPEN, CLOSED, MERGED], orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes {
            url
            state
          }
        }`;
      })
      .join('\n');

    const safeOwner = repoOwner.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const safeName = repoName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const query = `query { repository(owner: "${safeOwner}", name: "${safeName}") { ${aliasedFields} } }`;

    const resp = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!resp.ok) {
      // Fall back to marking all as no PR
      for (const branch of branches) {
        results[branch] = { hasPR: false, merged: false };
      }
      return results;
    }

    const data = (await resp.json()) as {
      data?: {
        repository?: Record<
          string,
          { nodes: Array<{ url: string; state: string }> }
        >;
      };
    };

    const repoData = data?.data?.repository;

    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i];
      const alias = `pr_${i}`;
      const nodes = repoData?.[alias]?.nodes;

      if (!nodes || nodes.length === 0) {
        results[branch] = { hasPR: false, merged: false };
      } else {
        const pr = nodes[0];
        results[branch] = {
          hasPR: true,
          merged: pr.state === 'MERGED',
          prUrl: pr.url,
        };
      }
    }
  } catch {
    // On any failure, mark all branches as no PR
    for (const branch of branches) {
      if (!(branch in results)) {
        results[branch] = { hasPR: false, merged: false };
      }
    }
  }

  return results;
}
