import { traceCliOperations } from "@trace/cli-contract";
import { defineCommand, optionInteger, type CommandDefinition } from "../../runtime.js";
import { requireCurrentAppGroup } from "./shared.js";

type EndpointView = {
  id: string;
  url: string;
  label: string;
  targetPort: number;
  status: string;
  accessMode: string;
};

type ProcessView = {
  id: string;
  appConfigId: string;
  processConfigId: string;
  label: string;
  status: string;
  exitCode?: number | null;
  lastError?: string | null;
  endpoints: EndpointView[];
};

type ApplicationView = {
  id: string;
  name: string;
  processes: Array<{
    id: string;
    name: string;
    command: string;
    required: boolean;
    ports: Array<{ id: string; label: string; port: number; defaultForwardingEnabled: boolean }>;
  }>;
};

type ApplicationStateView = {
  applications: ApplicationView[];
  processes: ProcessView[];
  endpoints: EndpointView[];
};

function processLine(process: ProcessView): string {
  const urls = process.endpoints
    .filter((endpoint) => endpoint.status === "enabled")
    .map((endpoint) => endpoint.url)
    .join(",");
  return `${process.appConfigId}/${process.processConfigId}\t${process.status}\t${process.id}\t${urls || process.lastError || "-"}`;
}

function applicationLine(application: ApplicationView): string {
  return `${application.id}\t${application.name}\t${application.processes.map((process) => process.id).join(",")}`;
}

async function runApplicationMutation(
  ctx: Parameters<CommandDefinition["run"]>[0],
  operation:
    | typeof traceCliOperations.startSessionApplication
    | typeof traceCliOperations.stopSessionApplication,
  rootField: "startSessionApplication" | "stopSessionApplication",
  appConfigId: string,
) {
  const variables = { sessionGroupId: requireCurrentAppGroup(ctx), appConfigId };
  const result = await (
    await ctx.client()
  ).graphql<Record<typeof rootField, ProcessView[]>, typeof variables>(operation, variables);
  const processes = result[rootField];
  ctx.output(
    { processes },
    processes.length ? processes.map(processLine).join("\n") : "No application processes changed",
  );
}

async function runProcessMutation(
  ctx: Parameters<CommandDefinition["run"]>[0],
  operation:
    | typeof traceCliOperations.startSessionProcess
    | typeof traceCliOperations.stopSessionProcess
    | typeof traceCliOperations.restartSessionProcess,
  rootField: "startSessionProcess" | "stopSessionProcess" | "restartSessionProcess",
  appConfigId: string,
  processConfigId: string,
) {
  const variables = {
    sessionGroupId: requireCurrentAppGroup(ctx),
    appConfigId,
    processConfigId,
  };
  const result = await (
    await ctx.client()
  ).graphql<Record<typeof rootField, ProcessView>, typeof variables>(operation, variables);
  const process = result[rootField];
  ctx.output({ process }, processLine(process));
}

export const appRuntimeCommands: readonly CommandDefinition[] = [
  defineCommand({
    path: ["app", "list"],
    description: "List configured applications and live processes for the current cloud session",
    examples: ['"$TRACE_CLI" app list --json'],
    effects: ["Read-only; validates that the current session has a connected cloud runtime."],
    output:
      "Application and process IDs, process state, configured ports, and enabled endpoint URLs.",
    nextSteps: ['Use "$TRACE_CLI" app start <app-id> --json to start required processes.'],
    async run(ctx) {
      const variables = { sessionGroupId: requireCurrentAppGroup(ctx) };
      const result = await (
        await ctx.client()
      ).graphql<{ sessionApplicationState: ApplicationStateView }, typeof variables>(
        traceCliOperations.sessionApplicationState,
        variables,
      );
      const state = result.sessionApplicationState;
      const lines = [
        ...state.applications.map(applicationLine),
        ...state.processes.map(processLine),
      ];
      ctx.output({ state }, lines.length ? lines.join("\n") : "No applications configured");
    },
  }),
  defineCommand({
    path: ["app", "start"],
    description: "Start an application or one configured process in the current cloud session",
    examples: ['"$TRACE_CLI" app start web --json', '"$TRACE_CLI" app start web dev --json'],
    effects: ["Starts managed server processes and may enable their configured default ports."],
    output: "Started process state and any enabled endpoint URLs.",
    nextSteps: ['Run "$TRACE_CLI" app list --json to verify process and endpoint state.'],
    positionals: [{ name: "app-id", required: true }, { name: "process-id" }],
    async run(ctx, input) {
      const [appConfigId, processConfigId] = input.positionals as [string, string?];
      if (processConfigId) {
        await runProcessMutation(
          ctx,
          traceCliOperations.startSessionProcess,
          "startSessionProcess",
          appConfigId,
          processConfigId,
        );
      } else {
        await runApplicationMutation(
          ctx,
          traceCliOperations.startSessionApplication,
          "startSessionApplication",
          appConfigId,
        );
      }
    },
  }),
  defineCommand({
    path: ["app", "stop"],
    description: "Stop an application or one configured process in the current cloud session",
    examples: ['"$TRACE_CLI" app stop web --json', '"$TRACE_CLI" app stop web dev --json'],
    effects: ["Stops managed server processes and disables only their application-owned ports."],
    output: "Stopped process state.",
    nextSteps: ['Run "$TRACE_CLI" app list --json to verify the stopped state.'],
    positionals: [{ name: "app-id", required: true }, { name: "process-id" }],
    async run(ctx, input) {
      const [appConfigId, processConfigId] = input.positionals as [string, string?];
      if (processConfigId) {
        await runProcessMutation(
          ctx,
          traceCliOperations.stopSessionProcess,
          "stopSessionProcess",
          appConfigId,
          processConfigId,
        );
      } else {
        await runApplicationMutation(
          ctx,
          traceCliOperations.stopSessionApplication,
          "stopSessionApplication",
          appConfigId,
        );
      }
    },
  }),
  defineCommand({
    path: ["app", "restart"],
    description: "Restart one configured process in the current cloud session",
    examples: ['"$TRACE_CLI" app restart web dev --json'],
    effects: ["Stops and starts the selected managed server process."],
    output: "Restarted process state and any enabled endpoint URLs.",
    nextSteps: ['Run "$TRACE_CLI" app logs <process-instance-id> --json to inspect output.'],
    positionals: [
      { name: "app-id", required: true },
      { name: "process-id", required: true },
    ],
    async run(ctx, input) {
      await runProcessMutation(
        ctx,
        traceCliOperations.restartSessionProcess,
        "restartSessionProcess",
        input.positionals[0]!,
        input.positionals[1]!,
      );
    },
  }),
  defineCommand({
    path: ["app", "logs"],
    description: "Read bounded logs for a managed application process",
    examples: ['"$TRACE_CLI" app logs <process-instance-id> --limit 200 --json'],
    effects: ["Read-only; returns retained process output without changing the runtime."],
    output: "Timestamped stdout and stderr log entries in sequence order.",
    nextSteps: [
      'Use "$TRACE_CLI" app restart <app-id> <process-id> --json after correcting a failure.',
    ],
    positionals: [{ name: "process-instance-id", required: true }],
    options: [
      {
        name: "limit",
        flag: "--limit",
        kind: "integer",
        valueName: "N",
        min: 1,
        max: 1000,
        description: "Maximum retained entries to return (default: 200)",
      },
    ],
    async run(ctx, input) {
      const sessionGroupId = requireCurrentAppGroup(ctx);
      await (
        await ctx.client()
      ).graphql<{ sessionApplicationState: ApplicationStateView }, { sessionGroupId: string }>(
        traceCliOperations.sessionApplicationState,
        { sessionGroupId },
      );
      const variables = {
        processId: input.positionals[0]!,
        limit: optionInteger(input, "limit") ?? 200,
      };
      const result = await (
        await ctx.client()
      ).graphql<
        {
          sessionApplicationLogs: Array<{
            id: string;
            processId: string;
            stream: string;
            data: string;
            sequence: number;
            timestamp: string;
          }>;
        },
        typeof variables
      >(traceCliOperations.sessionApplicationLogs, variables);
      const logs = [...result.sessionApplicationLogs].reverse();
      ctx.output(
        { logs },
        logs.length
          ? logs.map((entry) => `${entry.timestamp}\t${entry.stream}\t${entry.data}`).join("\n")
          : "No logs found",
      );
    },
  }),
];
