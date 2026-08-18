import { APP_DEPLOYMENT_JOB_VERSION, type AppDeploymentJob } from "@trace/shared";

const LAUNCHER_REQUEST_TIMEOUT_MS = 30_000;

export type AppDeploymentDispatchInput = Omit<AppDeploymentJob, "source" | "version">;

export interface AppDeploymentDispatcher {
  enqueue(input: AppDeploymentDispatchInput): Promise<{ externalJobId: string | null }>;
}

export class LauncherAppDeploymentDispatcher implements AppDeploymentDispatcher {
  async enqueue(input: AppDeploymentDispatchInput) {
    const launcherUrl = process.env.TRACE_APP_DEPLOYMENT_LAUNCHER_URL?.trim();
    const launcherToken = process.env.TRACE_APP_DEPLOYMENT_LAUNCHER_TOKEN?.trim();
    const serverUrl = process.env.TRACE_SERVER_PUBLIC_URL?.trim();
    if (!launcherUrl || !launcherToken || !serverUrl) {
      throw new Error("Published app deployments are not configured for this environment");
    }
    const sourceUrl = new URL(
      `/internal/app-deployments/${input.deploymentId}/source`,
      serverUrl,
    ).toString();
    const request: Omit<AppDeploymentJob, "source"> & { sourceUrl: string } = {
      ...input,
      version: APP_DEPLOYMENT_JOB_VERSION,
      sourceUrl,
    };
    const response = await fetch(new URL("/app-deployments", launcherUrl).toString(), {
      method: "POST",
      headers: {
        authorization: `Bearer ${launcherToken}`,
        "content-type": "application/json",
        "trace-idempotency-key": input.deploymentId,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(LAUNCHER_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`App deployment launcher returned HTTP ${response.status}`);
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("App deployment launcher returned an invalid response");
    }
    const jobId = (body as Record<string, unknown>).jobId;
    if (typeof jobId !== "string" || !jobId) {
      throw new Error("App deployment launcher response requires jobId");
    }
    return { externalJobId: jobId };
  }
}

export const appDeploymentDispatcher: AppDeploymentDispatcher =
  new LauncherAppDeploymentDispatcher();
