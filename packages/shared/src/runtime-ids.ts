/**
 * Runtime instance IDs follow a predictable shape:
 *   - `cloud-machine-<id>`  — provisioned cloud VMs (set by cloud-machine-service)
 *   - `runtime_<id>`         — provisioned cloud runtimes (set by SessionAdapter)
 *   - any other string      — local bridge instanceId (UUID or user-specified)
 *
 * Keep this prefix in one place so server/client agree on detection.
 */
export const CLOUD_MACHINE_RUNTIME_PREFIX = "cloud-machine-";
export const PROVISIONED_RUNTIME_PREFIX = "runtime_";

export function isCloudMachineRuntimeId(runtimeInstanceId: string): boolean {
  return (
    runtimeInstanceId.startsWith(CLOUD_MACHINE_RUNTIME_PREFIX) ||
    runtimeInstanceId.startsWith(PROVISIONED_RUNTIME_PREFIX)
  );
}
