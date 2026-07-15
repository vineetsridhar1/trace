import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const infraRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(infraRoot, "config/production.json");

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function optional(name) {
  return process.env[name]?.trim() || undefined;
}

function integer(name, fallback) {
  const raw = optional(name);
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

function bool(name, fallback) {
  const raw = optional(name)?.toLowerCase();
  if (!raw) return fallback;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`${name} must be true or false`);
}

const hostedZoneId = optional("ROUTE53_HOSTED_ZONE_ID");
const config = {
  account: required("AWS_ACCOUNT_ID"),
  environmentName: optional("TRACE_ENVIRONMENT_NAME") ?? "prod",
  region: required("AWS_REGION"),
  domainName: required("TRACE_DOMAIN_NAME"),
  hostedZoneId,
  createHostedZone: !hostedZoneId,
  githubRepository: optional("GITHUB_REPOSITORY") ?? "vineetsridhar1/trace",
  githubDeployBranch: optional("GITHUB_DEPLOY_BRANCH") ?? "main",
  alertEmail: optional("ALERT_EMAIL"),
  availabilityZones: integer("AVAILABILITY_ZONES", 3),
  natGateways: integer("NAT_GATEWAYS", 1),
  enablePaidVpcEndpoints: bool("ENABLE_PAID_VPC_ENDPOINTS", false),
  controlImageTag: required("CONTROL_IMAGE_TAG"),
  runtimeImageTag: required("RUNTIME_IMAGE_TAG"),
  webDesiredCount: integer("WEB_DESIRED_COUNT", 2),
  apiDesiredCount: 1,
  apiCpu: integer("API_CPU", 1024),
  apiMemoryMiB: integer("API_MEMORY_MIB", 2048),
  runtimeCpu: integer("RUNTIME_CPU", 2048),
  runtimeMemoryMiB: integer("RUNTIME_MEMORY_MIB", 4096),
  runtimeEphemeralStorageGiB: integer("RUNTIME_EPHEMERAL_STORAGE_GIB", 40),
  auroraMinAcu: Number(optional("AURORA_MIN_ACU") ?? "0.5"),
  auroraMaxAcu: Number(optional("AURORA_MAX_ACU") ?? "4"),
  enableControlDatabaseReader: bool("ENABLE_CONTROL_DATABASE_READER", false),
  enableAppData: bool("ENABLE_APP_DATA", true),
  enableAppDataReader: bool("ENABLE_APP_DATA_READER", false),
  monthlyBudgetUsd: integer("MONTHLY_BUDGET_USD", 500),
  retainDataOnDelete: true,
  enableAwsConfig: bool("ENABLE_AWS_CONFIG", true),
  enableSecurityHub: bool("ENABLE_SECURITY_HUB", true),
  enableGuardDuty: bool("ENABLE_GUARD_DUTY", true),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
console.log(`Wrote ${outputPath}`);
