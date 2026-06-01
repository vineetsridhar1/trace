/**
 * Runtime instance IDs follow a predictable shape:
 *   - `runtime_<id>`         — provisioned cloud runtimes (set by SessionAdapter)
 *   - any other string      — local bridge instanceId (UUID or user-specified)
 *
 * Keep this prefix in one place so server/client agree on detection.
 */
export const PROVISIONED_RUNTIME_PREFIX = "runtime_";

export function isProvisionedRuntimeId(runtimeInstanceId: string): boolean {
  return runtimeInstanceId.startsWith(PROVISIONED_RUNTIME_PREFIX);
}
