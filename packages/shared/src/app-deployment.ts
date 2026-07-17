export const APP_DEPLOYMENT_JOB_VERSION = 1 as const;

export type AppDeploymentJob = {
  version: typeof APP_DEPLOYMENT_JOB_VERSION;
  deploymentId: string;
  organizationId: string;
  sessionGroupId: string;
  repoId: string;
  checkpointId: string;
  commitSha: string;
  appSlug: string;
  source: {
    bucket: string;
    key: string;
  };
  requestedAt: string;
};
