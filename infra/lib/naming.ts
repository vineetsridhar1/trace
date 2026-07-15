import { Tags, type Stack } from "aws-cdk-lib";
import type { TraceInfraConfig } from "./config.js";

export function resourceName(config: TraceInfraConfig, suffix: string): string {
  return `trace-${config.environmentName}-${suffix}`;
}

export function stackName(config: TraceInfraConfig, suffix: string): string {
  return `Trace-${config.environmentName}-${suffix}`;
}

export function applyStandardTags(stack: Stack, config: TraceInfraConfig): void {
  Tags.of(stack).add("Application", "trace");
  Tags.of(stack).add("Environment", config.environmentName);
  Tags.of(stack).add("Owner", "trace-engineering");
  Tags.of(stack).add("CostCenter", "trace-production");
  Tags.of(stack).add("ManagedBy", "aws-cdk");
}
