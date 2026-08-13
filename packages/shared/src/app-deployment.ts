export const APP_DEPLOYMENT_JOB_VERSION = 2 as const;

export type AppDeploymentTarget = "static" | "service";

export type AppDeploymentSpec = {
  target: AppDeploymentTarget;
  buildCommand?: string;
  outputDirectory?: string;
  startCommand?: string;
  port?: number;
  healthPath?: string;
  database?: boolean;
  migrationCommand?: string;
};

export type AppDeploymentJob = {
  version: typeof APP_DEPLOYMENT_JOB_VERSION;
  deploymentId: string;
  organizationId: string;
  sessionGroupId: string;
  repoId: string;
  commitSha: string;
  appSlug: string;
  spec: AppDeploymentSpec;
  source: {
    bucket: string;
    key: string;
  };
  callback: {
    url: string;
    token: string;
  };
  requestedAt: string;
};
