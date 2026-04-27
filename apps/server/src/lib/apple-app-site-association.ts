const TRACE_IOS_BUNDLE_ID = "org.gettrace";

export type AppleAppSiteAssociation = {
  applinks: {
    details: Array<{
      appIDs: string[];
      components: Array<Record<string, string>>;
    }>;
  };
};

export function buildAppleAppSiteAssociation(teamId: string): AppleAppSiteAssociation {
  const normalizedTeamId = teamId.trim();
  if (!normalizedTeamId) {
    throw new Error("APPLE_TEAM_ID must not be empty");
  }

  return {
    applinks: {
      details: [
        {
          appIDs: [`${normalizedTeamId}.${TRACE_IOS_BUNDLE_ID}`],
          components: [{ "/": "/m/*" }],
        },
      ],
    },
  };
}
