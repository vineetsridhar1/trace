import { randomUUID } from "node:crypto";
import { traceCliOperations } from "@trace/cli-contract";
import type { AppDeployment, DeployAppSessionInput } from "@trace/gql";
import {
  defineCommand,
  optionBoolean,
  optionInteger,
  optionString,
  type CommandDefinition,
} from "../../runtime.js";
import { usage } from "../../errors.js";
import { requireCurrentAppGroup } from "./shared.js";

type DeploymentView = Pick<
  AppDeployment,
  "id" | "status" | "target" | "commitSha" | "url" | "errorMessage" | "queuedAt" | "updatedAt"
>;

function deploymentLine(deployment: DeploymentView): string {
  const destination = deployment.url ?? deployment.errorMessage ?? "pending";
  return `${deployment.id}\t${deployment.status}\t${deployment.target}\t${deployment.commitSha.slice(0, 8)}\t${destination}`;
}

const deployCommand = defineCommand({
  path: ["app", "deploy"],
  description: "Deploy the current app using explicit AI-supplied runtime facts",
  examples: [
    '"$TRACE_CLI" app deploy --target static --output-directory dist --build-command "pnpm build" --json',
    '"$TRACE_CLI" app deploy --target service --build-command "pnpm build" --start-command "pnpm start" --port 3000 --health-path /health --database --migration-command "pnpm db:migrate" --json',
  ],
  effects: [
    "Commits no files and performs no project analysis.",
    "Queues a durable production deployment of the latest pushed app commit.",
    "May create or update AWS runtime resources and a persistent app database.",
  ],
  output: "The queued deployment, immutable commit, selected target, status, and eventual URL.",
  nextSteps: ['Run "$TRACE_CLI" app status --json to monitor the durable workflow.'],
  notes: [
    "The AI must inspect and build-test the project before choosing these arguments; the CLI does not infer them.",
    "Static output directories must be relative to the repository root.",
    "A migration command is valid only with --database.",
  ],
  options: [
    {
      name: "idempotencyKey",
      flag: "--idempotency-key",
      kind: "string",
      valueName: "KEY",
      description: "Stable key for safely retrying the same deployment request",
    },
    {
      name: "target",
      flag: "--target",
      kind: "string",
      valueName: "KIND",
      choices: ["static", "service"],
      description: "Explicit hosting target",
    },
    {
      name: "buildCommand",
      flag: "--build-command",
      kind: "string",
      valueName: "COMMAND",
      description: "Build command selected by the AI",
    },
    {
      name: "outputDirectory",
      flag: "--output-directory",
      kind: "string",
      valueName: "PATH",
      description: "Static build output directory",
    },
    {
      name: "startCommand",
      flag: "--start-command",
      kind: "string",
      valueName: "COMMAND",
      description: "Long-running service start command",
    },
    {
      name: "port",
      flag: "--port",
      kind: "integer",
      valueName: "PORT",
      min: 1,
      max: 65535,
      description: "HTTP port exposed by the service",
    },
    {
      name: "healthPath",
      flag: "--health-path",
      kind: "string",
      valueName: "PATH",
      description: "HTTP health-check path",
    },
    {
      name: "database",
      flag: "--database",
      kind: "boolean",
      description: "Provision persistent PostgreSQL access",
    },
    {
      name: "migrationCommand",
      flag: "--migration-command",
      kind: "string",
      valueName: "COMMAND",
      description: "One-time database migration command",
    },
  ],
  async run(ctx, parsed) {
    const target = optionString(parsed, "target");
    if (!target) usage("--target is required");
    const input: DeployAppSessionInput = {
      sessionGroupId: requireCurrentAppGroup(ctx),
      clientMutationId: optionString(parsed, "idempotencyKey") ?? randomUUID(),
      target,
      buildCommand: optionString(parsed, "buildCommand"),
      outputDirectory: optionString(parsed, "outputDirectory"),
      startCommand: optionString(parsed, "startCommand"),
      port: optionInteger(parsed, "port"),
      healthPath: optionString(parsed, "healthPath"),
      database: optionBoolean(parsed, "database"),
      migrationCommand: optionString(parsed, "migrationCommand"),
    };
    const client = await ctx.client();
    const result = await client.graphql<
      { deployAppSession: DeploymentView },
      { input: DeployAppSessionInput }
    >(traceCliOperations.deployAppSession, { input });
    ctx.output({ deployment: result.deployAppSession }, deploymentLine(result.deployAppSession));
  },
});

const statusCommand = defineCommand({
  path: ["app", "status"],
  description: "List durable deployments for the current app",
  examples: ['"$TRACE_CLI" app status --json'],
  effects: ["Read-only; does not build, deploy, promote, or stop anything."],
  output: "Recent deployments with target, commit, status, URL, and safe failure details.",
  nextSteps: [
    "If the deployment is still active, wait and run this command again; if it failed, inspect the returned error before retrying.",
  ],
  async run(ctx) {
    const variables = { sessionGroupId: requireCurrentAppGroup(ctx) };
    const result = await (
      await ctx.client()
    ).graphql<{ appDeployments: DeploymentView[] }, typeof variables>(
      traceCliOperations.appDeployments,
      variables,
    );
    ctx.output(
      { deployments: result.appDeployments },
      result.appDeployments.length
        ? result.appDeployments.map(deploymentLine).join("\n")
        : "No deployments found",
    );
  },
});

export const appCommands: readonly CommandDefinition[] = [deployCommand, statusCommand];
