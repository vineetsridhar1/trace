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
  githubDeployEnvironment: string;
  existingGithubOidcProviderArn?: string;
  networkMode: "managed" | "existing";
  existingVpcId?: string;
  existingAvailabilityZones?: string[];
  existingPublicSubnetIds?: string[];
  existingPublicRouteTableIds?: string[];
  existingControlPlaneSubnetIds?: string[];
  existingControlPlaneRouteTableIds?: string[];
  existingRuntimeSubnetIds?: string[];
  existingRuntimeRouteTableIds?: string[];
  existingDataSubnetIds?: string[];
  existingDataRouteTableIds?: string[];
  controlDatabaseMode: "managed" | "existing";
  existingControlDatabaseHost?: string;
  existingControlDatabasePort?: number;
  existingControlDatabaseName?: string;
  existingControlDatabaseIdentifier?: string;
  existingControlDatabaseSecretArn?: string;
  existingControlDatabaseSecretKmsKeyArn?: string;
  existingControlDatabaseSecurityGroupId?: string;
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
  "githubDeployEnvironment",
  "controlImageTag",
  "runtimeImageTag",
] as const;

function requireString(config: TraceInfraConfig, key: keyof TraceInfraConfig): void {
  const value = config[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Infrastructure config requires ${String(key)}`);
  }
}

function requireList(config: TraceInfraConfig, key: keyof TraceInfraConfig): void {
  const value = config[key];
  if (!Array.isArray(value) || value.length < 2 || value.some((id) => !id.trim())) {
    throw new Error(`${String(key)} must contain at least two values`);
  }
}

function requireSubnetGroup(
  config: TraceInfraConfig,
  subnetKey: keyof TraceInfraConfig,
  routeTableKey: keyof TraceInfraConfig,
): void {
  requireList(config, subnetKey);
  requireList(config, routeTableKey);
  const subnets = config[subnetKey] as string[];
  const routeTables = config[routeTableKey] as string[];
  if (subnets.length !== routeTables.length) {
    throw new Error(`${String(routeTableKey)} must align one-to-one with ${String(subnetKey)}`);
  }
}

function assertConfig(config: TraceInfraConfig): void {
  for (const key of requiredStringKeys) {
    if (!config[key]?.trim()) throw new Error(`Infrastructure config requires ${key}`);
  }
  if (config.networkMode !== "managed" && config.networkMode !== "existing") {
    throw new Error("networkMode must be managed or existing");
  }
  if (config.controlDatabaseMode !== "managed" && config.controlDatabaseMode !== "existing") {
    throw new Error("controlDatabaseMode must be managed or existing");
  }
  if (config.networkMode === "existing") {
    requireString(config, "existingVpcId");
    requireList(config, "existingAvailabilityZones");
    requireSubnetGroup(config, "existingPublicSubnetIds", "existingPublicRouteTableIds");
    requireSubnetGroup(
      config,
      "existingControlPlaneSubnetIds",
      "existingControlPlaneRouteTableIds",
    );
    requireSubnetGroup(config, "existingRuntimeSubnetIds", "existingRuntimeRouteTableIds");
    requireSubnetGroup(config, "existingDataSubnetIds", "existingDataRouteTableIds");
    if (config.enablePaidVpcEndpoints) {
      throw new Error("enablePaidVpcEndpoints must be false when networkMode is existing");
    }
  }
  if (config.controlDatabaseMode === "existing") {
    if (config.networkMode !== "existing") {
      throw new Error("An existing control database requires networkMode existing");
    }
    for (const key of [
      "existingControlDatabaseHost",
      "existingControlDatabaseName",
      "existingControlDatabaseIdentifier",
      "existingControlDatabaseSecretArn",
      "existingControlDatabaseSecurityGroupId",
    ] as const) {
      requireString(config, key);
    }
    const port = config.existingControlDatabasePort;
    if (!Number.isInteger(port) || port! < 1 || port! > 65535) {
      throw new Error("existingControlDatabasePort must be a valid TCP port");
    }
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
  if (
    !Number.isFinite(config.auroraMinAcu) ||
    !Number.isFinite(config.auroraMaxAcu) ||
    config.auroraMinAcu < 0 ||
    config.auroraMaxAcu < config.auroraMinAcu
  ) {
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
