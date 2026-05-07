import type { V1Job, V1Pod } from "@kubernetes/client-node";
import type { RuntimeStatusResponse, TraceRuntimeStatus } from "./types.js";

export function mapKubernetesRuntimeStatus(job: V1Job, pods: V1Pod[]): RuntimeStatusResponse {
  if (job.metadata?.deletionTimestamp) {
    return status("stopping", job, pods);
  }

  if ((job.status?.failed ?? 0) > 0) {
    return status("failed", job, pods);
  }

  if ((job.status?.succeeded ?? 0) > 0) {
    return status("stopped", job, pods);
  }

  if (pods.length === 0) {
    return status("provisioning", job, pods, "Job exists but no Pod has been created yet.");
  }

  if (pods.some((pod) => pod.metadata?.deletionTimestamp)) {
    return status("stopping", job, pods);
  }

  if (pods.some((pod) => pod.status?.phase === "Failed")) {
    return status("failed", job, pods);
  }

  if (pods.some((pod) => pod.status?.phase === "Running")) {
    return status("connected", job, pods);
  }

  if (pods.some((pod) => pod.status?.phase === "Pending")) {
    return status("booting", job, pods);
  }

  if (pods.some((pod) => pod.status?.phase === "Succeeded")) {
    return status("stopped", job, pods);
  }

  return status("unknown", job, pods);
}

function status(
  runtimeStatus: TraceRuntimeStatus,
  job: V1Job,
  pods: V1Pod[],
  message?: string,
): RuntimeStatusResponse {
  return {
    status: runtimeStatus,
    ...(message ? { message } : {}),
    metadata: {
      jobName: job.metadata?.name ?? "unknown",
      jobActive: job.status?.active ?? 0,
      jobSucceeded: job.status?.succeeded ?? 0,
      jobFailed: job.status?.failed ?? 0,
      podPhases: pods.map((pod) => pod.status?.phase ?? "Unknown"),
    },
  };
}
