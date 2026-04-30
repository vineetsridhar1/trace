import { CloudMachineService } from "./cloud-machine-service.js";
import { flyProvider } from "./fly-provider.js";

/**
 * Transitional Fly compatibility for cloud-machine bridge tokens and restore.
 *
 * New cloud session starts must go through provisioned AgentEnvironments and
 * the generic launcher contract. This service exists only so already-created
 * CloudMachine rows can reconnect and be idled or destroyed during migration.
 */
export function createLegacyCloudMachineCompatibilityService(options: {
  localMode: boolean;
}): CloudMachineService | null {
  if (options.localMode) return null;
  return new CloudMachineService(flyProvider, "fly");
}
