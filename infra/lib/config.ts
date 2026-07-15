import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { App } from "aws-cdk-lib";

export interface TraceInfraConfig {
  account?: string;
  environmentName: string;
  region: string;
  domainName: string;
  hostedZoneId?: string;
  createHostedZone: boolean;
  githubRepository: string;
  githubDeployBranch: string;
  alertEmail?: string;
  availabilityZones: number;
  natGateways: number;
  enablePaidVpcEndpoints: boolean;
  controlImageTag: string;
  runtimeImageTag: string;
  webDesiredCount: number;
  apiDesiredCount: number;
  apiCpu: number;
  apiMemoryMiB: number;
  runtimeCpu: number;
  runtimeMemoryMiB: number;
  runtimeEphemeralStorageGiB: number;
  auroraMinAcu: number;
  auroraMaxAcu: number;
  enableControlDatabaseReader: boolean;
  enableAppData: boolean;
  enableAppDataReader: boolean;
  monthlyBudgetUsd: number;
  retainDataOnDelete: boolean;
  enableAwsConfig: boolean;
  enableSecurityHub: boolean;
  enableGuardDuty: boolean;
}

const requiredStringKeys = [
  "environmentName",
  "region",
  "domainName",
  "githubRepository",
  "githubDeployBranch",
  "controlImageTag",
  "runtimeImageTag",
] as const;

function assertConfig(config: TraceInfraConfig): void {
  for (const key of requiredStringKeys) {
    if (!config[key]?.trim()) throw new Error(`Infrastructure config requires ${key}`);
  }
  if (!config.createHostedZone && !config.hostedZoneId) {
    throw new Error("Set hostedZoneId when createHostedZone is false");
  }
  if (!/^[a-z0-9][a-z0-9-]{0,15}$/.test(config.environmentName)) {
    throw new Error("environmentName must be lowercase, hyphenated, and at most 16 characters");
  }
  if (!/^\d+$/.test(String(config.monthlyBudgetUsd)) || config.monthlyBudgetUsd <= 0) {
    throw new Error("monthlyBudgetUsd must be a positive whole number");
  }
  if (config.availabilityZones < 2 || config.availabilityZones > 3) {
    throw new Error("availabilityZones must be 2 or 3");
  }
  if (config.natGateways < 1 || config.natGateways > config.availabilityZones) {
    throw new Error("natGateways must be between 1 and availabilityZones");
  }
  if (config.apiDesiredCount !== 1) {
    throw new Error(
      "apiDesiredCount must remain 1 until runtime socket ownership is extracted from the backend",
    );
  }
  if (config.auroraMinAcu < 0 || config.auroraMaxAcu < config.auroraMinAcu) {
    throw new Error("Aurora ACU bounds are invalid");
  }
}

export function loadConfig(app: App): TraceInfraConfig {
  const configuredPath = String(app.node.tryGetContext("config") ?? "config/production.json");
  const configPath = isAbsolute(configuredPath)
    ? configuredPath
    : resolve(process.cwd(), configuredPath);
  const config = JSON.parse(readFileSync(configPath, "utf8")) as TraceInfraConfig;
  assertConfig(config);
  return config;
}
