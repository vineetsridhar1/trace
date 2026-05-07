import * as k8s from "@kubernetes/client-node";
import type { ControllerConfig } from "./config.js";
import { mapKubernetesRuntimeStatus } from "./status.js";
import type { RuntimeRecord, RuntimeStatusResponse, StartSessionRequest } from "./types.js";

const APP_LABEL = "trace-runtime";

export class KubernetesApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "KubernetesApiError";
    this.status = status;
  }
}

export class KubernetesRuntimeClient {
  private readonly batch: k8s.BatchV1Api;
  private readonly core: k8s.CoreV1Api;

  constructor(
    private readonly config: ControllerConfig,
    kubeConfig = defaultKubeConfig(),
  ) {
    this.batch = kubeConfig.makeApiClient(k8s.BatchV1Api);
    this.core = kubeConfig.makeApiClient(k8s.CoreV1Api);
  }

  async createRuntimeJob(
    request: StartSessionRequest,
    idempotencyKey: string | undefined,
  ): Promise<RuntimeRecord> {
    const name = buildJobName(request.runtimeInstanceId);
    const secretName = `${name}-token`;

    await this.createSecretIfMissing(secretName, request.runtimeToken);
    await this.createJobIfMissing(name, secretName, request, idempotencyKey);

    return {
      id: name,
      namespace: this.config.namespace,
      label: `Kubernetes ${shortId(request.runtimeInstanceId, "runtime")}`,
    };
  }

  async deleteRuntimeJob(runtimeId: string): Promise<{ alreadyGone: boolean }> {
    const jobGone = await this.deleteJobIfExists(runtimeId);
    const secretGone = await this.deleteSecretIfExists(`${runtimeId}-token`);
    return { alreadyGone: jobGone && secretGone };
  }

  async getRuntimeStatus(runtimeId: string): Promise<RuntimeStatusResponse> {
    let job: k8s.V1Job;
    try {
      job = await this.batch.readNamespacedJob({
        namespace: this.config.namespace,
        name: runtimeId,
      });
    } catch (error) {
      if (isKubernetesStatus(error, 404)) {
        return {
          status: "stopped",
          message: "Kubernetes Job was not found; it may already be deleted.",
          metadata: { jobName: runtimeId, kubernetesState: "not_found" },
        };
      }

      throw toKubernetesApiError(error, "read job");
    }

    const pods = await this.core
      .listNamespacedPod({
        namespace: this.config.namespace,
        labelSelector: `trace.trace.dev/runtime-id=${runtimeId}`,
      })
      .then((list) => list.items)
      .catch((error: unknown) => {
        throw toKubernetesApiError(error, "list pods");
      });

    return mapKubernetesRuntimeStatus(job, pods);
  }

  private async createSecretIfMissing(name: string, runtimeToken: string): Promise<void> {
    const secret = buildRuntimeTokenSecret(this.config.namespace, name, runtimeToken);

    try {
      await this.core.createNamespacedSecret({
        namespace: this.config.namespace,
        body: secret,
      });
    } catch (error) {
      if (isKubernetesStatus(error, 409)) {
        return;
      }

      throw toKubernetesApiError(error, "create secret");
    }
  }

  private async createJobIfMissing(
    name: string,
    secretName: string,
    request: StartSessionRequest,
    idempotencyKey: string | undefined,
  ): Promise<void> {
    const job = buildRuntimeJob(this.config, name, secretName, request, idempotencyKey);

    try {
      await this.batch.createNamespacedJob({
        namespace: this.config.namespace,
        body: job,
      });
    } catch (error) {
      if (isKubernetesStatus(error, 409)) {
        return;
      }

      throw toKubernetesApiError(error, "create job");
    }
  }

  private async deleteJobIfExists(name: string): Promise<boolean> {
    try {
      await this.batch.deleteNamespacedJob({
        namespace: this.config.namespace,
        name,
        propagationPolicy: "Background",
      });
      return false;
    } catch (error) {
      if (isKubernetesStatus(error, 404)) {
        return true;
      }

      throw toKubernetesApiError(error, "delete job");
    }
  }

  private async deleteSecretIfExists(name: string): Promise<boolean> {
    try {
      await this.core.deleteNamespacedSecret({
        namespace: this.config.namespace,
        name,
      });
      return false;
    } catch (error) {
      if (isKubernetesStatus(error, 404)) {
        return true;
      }

      throw toKubernetesApiError(error, "delete secret");
    }
  }
}

export function buildRuntimeJob(
  config: ControllerConfig,
  name: string,
  secretName: string,
  request: StartSessionRequest,
  idempotencyKey: string | undefined,
): k8s.V1Job {
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name,
      namespace: config.namespace,
      labels: labels(request, name),
      annotations: {
        "trace.trace.dev/runtime-instance-id": request.runtimeInstanceId,
        "trace.trace.dev/environment-id": request.metadata.environmentId,
        ...(idempotencyKey ? { "trace.trace.dev/idempotency-key": idempotencyKey } : {}),
      },
    },
    spec: {
      backoffLimit: 0,
      ttlSecondsAfterFinished: 300,
      template: {
        metadata: {
          labels: labels(request, name),
        },
        spec: {
          restartPolicy: "Never",
          serviceAccountName: config.runtimeServiceAccount,
          ...(config.runtimeImagePullSecretNames.length
            ? {
                imagePullSecrets: config.runtimeImagePullSecretNames.map((secretName) => ({
                  name: secretName,
                })),
              }
            : {}),
          containers: [
            {
              name: "runtime",
              image: config.traceRuntimeImage,
              imagePullPolicy: "IfNotPresent",
              env: buildRuntimeEnv(config, request, secretName),
              ...(config.runtimeEnvSecretNames.length
                ? {
                    envFrom: config.runtimeEnvSecretNames.map((secretName) => ({
                      secretRef: { name: secretName },
                    })),
                  }
                : {}),
              resources: {
                requests: {
                  cpu: config.runtimeCpuRequest,
                  memory: config.runtimeMemoryRequest,
                },
                limits: {
                  cpu: config.runtimeCpuLimit,
                  memory: config.runtimeMemoryLimit,
                },
              },
            },
          ],
        },
      },
    },
  };
}

export function buildRuntimeEnv(
  config: ControllerConfig,
  request: StartSessionRequest,
  secretName: string,
): k8s.V1EnvVar[] {
  return [
    ...Object.entries(config.runtimePassthroughEnv).map(([name, value]) => ({ name, value })),
    ...Object.entries(request.bootstrapEnv)
      .filter(([name]) => name !== "TRACE_RUNTIME_TOKEN")
      .map(([name, value]) => ({ name, value })),
    {
      name: "TRACE_RUNTIME_TOKEN",
      valueFrom: {
        secretKeyRef: {
          name: secretName,
          key: "runtime-token",
        },
      },
    },
    { name: "TRACE_TOOL", value: request.tool },
    { name: "TRACE_WORKSPACE_ISOLATION", value: "per_session_runtime" },
    ...(request.model ? [{ name: "TRACE_MODEL", value: request.model }] : []),
    ...(request.reasoningEffort
      ? [{ name: "TRACE_REASONING_EFFORT", value: request.reasoningEffort }]
      : []),
    ...(request.repo
      ? [
          { name: "TRACE_REPO_URL", value: request.repo.remoteUrl },
          { name: "TRACE_REPO_BRANCH", value: request.repo.branch ?? request.repo.defaultBranch },
        ]
      : []),
  ];
}

export function buildRuntimeTokenSecret(
  namespace: string,
  name: string,
  runtimeToken: string,
): k8s.V1Secret {
  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name,
      namespace,
      labels: {
        "app.kubernetes.io/name": APP_LABEL,
      },
    },
    type: "Opaque",
    stringData: {
      "runtime-token": runtimeToken,
    },
  };
}

export function buildJobName(runtimeInstanceId: string): string {
  return `trace-runtime-${shortId(runtimeInstanceId, "runtime")}`.toLowerCase();
}

function labels(request: StartSessionRequest, runtimeId: string): Record<string, string> {
  return {
    "app.kubernetes.io/name": APP_LABEL,
    "trace.trace.dev/session-id": safeLabelValue(request.sessionId),
    "trace.trace.dev/org-id": safeLabelValue(request.orgId),
    "trace.trace.dev/runtime-id": runtimeId,
  };
}

function shortId(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");

  return cleaned || fallback;
}

function safeLabelValue(value: string): string {
  const cleaned = value
    .replace(/[^a-zA-Z0-9_.-]/g, "-")
    .slice(0, 63)
    .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");

  return cleaned || "unknown";
}

function defaultKubeConfig(): k8s.KubeConfig {
  const kubeConfig = new k8s.KubeConfig();
  kubeConfig.loadFromDefault();
  return kubeConfig;
}

function isKubernetesStatus(error: unknown, status: number): boolean {
  return getKubernetesStatus(error) === status;
}

function getKubernetesStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  if (typeof record.statusCode === "number") return record.statusCode;
  if (typeof record.status === "number") return record.status;
  const response = record.response;
  if (response && typeof response === "object") {
    const responseRecord = response as Record<string, unknown>;
    if (typeof responseRecord.statusCode === "number") return responseRecord.statusCode;
    if (typeof responseRecord.status === "number") return responseRecord.status;
  }
  return undefined;
}

function toKubernetesApiError(error: unknown, operation: string): KubernetesApiError {
  const status = getKubernetesStatus(error);
  const message = error instanceof Error ? error.message : `Kubernetes ${operation} failed`;
  return new KubernetesApiError(message, status);
}
