import { traceCliOperations } from "@trace/cli-contract";
import { usage } from "../../errors.js";
import { defineCommand, optionString, type CommandDefinition } from "../../runtime.js";
import { requireCurrentAppGroup } from "../app/shared.js";

type EndpointView = {
  id: string;
  url: string;
  label: string;
  targetPort: number;
  status: string;
  accessMode: string;
  appConfigId: string;
  processConfigId: string;
};

function endpointLine(endpoint: EndpointView): string {
  return `${endpoint.id}\t${endpoint.targetPort}\t${endpoint.status}\t${endpoint.accessMode}\t${endpoint.url}\t${endpoint.label}`;
}

const accessOption = {
  name: "access",
  flag: "--access",
  kind: "string",
  valueName: "MODE",
  choices: ["public", "private"],
  description: "Endpoint access mode",
} as const;

export const portCommands: readonly CommandDefinition[] = [
  defineCommand({
    path: ["port", "list"],
    description: "List independently managed and application-owned ports in the cloud session",
    examples: ['"$TRACE_CLI" port list --json'],
    effects: ["Read-only; validates that the current session has a connected cloud runtime."],
    output: "Endpoint IDs, target ports, states, access modes, labels, and public URLs.",
    nextSteps: ['Use "$TRACE_CLI" port forward <port> --json to expose an arbitrary HTTP port.'],
    async run(ctx) {
      const variables = { sessionGroupId: requireCurrentAppGroup(ctx) };
      const result = await (
        await ctx.client()
      ).graphql<{ sessionApplicationState: { endpoints: EndpointView[] } }, typeof variables>(
        traceCliOperations.sessionApplicationState,
        variables,
      );
      const endpoints = result.sessionApplicationState.endpoints;
      ctx.output(
        { endpoints },
        endpoints.length ? endpoints.map(endpointLine).join("\n") : "No forwarded ports found",
      );
    },
  }),
  defineCommand({
    path: ["port", "forward"],
    description: "Expose any HTTP port from the current cloud session runtime",
    examples: [
      '"$TRACE_CLI" port forward 5173 --json',
      '"$TRACE_CLI" port forward 8080 --label API --access private --json',
    ],
    effects: [
      "Creates or re-enables a stable endpoint independently of application configuration or process commands.",
    ],
    output: "The endpoint ID, target port, access mode, state, and internet URL.",
    nextSteps: ['Use "$TRACE_CLI" port disable <endpoint-id> --json to turn forwarding off.'],
    positionals: [{ name: "port", required: true }],
    options: [
      {
        name: "label",
        flag: "--label",
        kind: "string",
        valueName: "TEXT",
        description: "Human-readable endpoint label",
      },
      accessOption,
    ],
    async run(ctx, input) {
      const port = Number(input.positionals[0]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        usage("Port must be an integer from 1 to 65535");
      }
      const variables = {
        sessionGroupId: requireCurrentAppGroup(ctx),
        port,
        label: optionString(input, "label"),
        accessMode: optionString(input, "access") ?? "public",
      };
      const result = await (
        await ctx.client()
      ).graphql<{ forwardSessionPort: EndpointView }, typeof variables>(
        traceCliOperations.forwardSessionPort,
        variables,
      );
      ctx.output({ endpoint: result.forwardSessionPort }, endpointLine(result.forwardSessionPort));
    },
  }),
  defineCommand({
    path: ["port", "enable"],
    description: "Turn on an existing cloud-session endpoint",
    examples: ['"$TRACE_CLI" port enable <endpoint-id> --access public --json'],
    effects: [
      "Enables forwarding; arbitrary-port endpoints do not require a managed application process.",
    ],
    output: "The enabled endpoint and URL.",
    nextSteps: ['Use "$TRACE_CLI" port list --json to inspect all endpoint states.'],
    positionals: [{ name: "endpoint-id", required: true }],
    options: [accessOption],
    async run(ctx, input) {
      const variables = {
        endpointId: input.positionals[0]!,
        accessMode: optionString(input, "access"),
      };
      const result = await (
        await ctx.client()
      ).graphql<{ enableSessionEndpointForwarding: EndpointView }, typeof variables>(
        traceCliOperations.enableSessionEndpointForwarding,
        variables,
      );
      ctx.output(
        { endpoint: result.enableSessionEndpointForwarding },
        endpointLine(result.enableSessionEndpointForwarding),
      );
    },
  }),
  defineCommand({
    path: ["port", "disable"],
    description: "Turn off an existing cloud-session endpoint without stopping its server",
    examples: ['"$TRACE_CLI" port disable <endpoint-id> --json'],
    effects: [
      "Disables internet forwarding only; it does not stop any application or arbitrary server.",
    ],
    output: "The disabled endpoint and stable URL.",
    nextSteps: ['Use "$TRACE_CLI" port enable <endpoint-id> --json to re-enable it later.'],
    positionals: [{ name: "endpoint-id", required: true }],
    async run(ctx, input) {
      const variables = { endpointId: input.positionals[0]! };
      const result = await (
        await ctx.client()
      ).graphql<{ disableSessionEndpointForwarding: EndpointView }, typeof variables>(
        traceCliOperations.disableSessionEndpointForwarding,
        variables,
      );
      ctx.output(
        { endpoint: result.disableSessionEndpointForwarding },
        endpointLine(result.disableSessionEndpointForwarding),
      );
    },
  }),
];
