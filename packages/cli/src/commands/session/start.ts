import type {
  CodingTool,
  HostingMode,
  SessionGroupKind,
  SessionGroupVisibility,
  StartSessionInput,
} from "@trace/gql";
import { randomUUID } from "node:crypto";
import { usage } from "../../errors.js";
import { defineCommand, optionBoolean, optionString } from "../../runtime.js";
import {
  CODING_TOOLS,
  HOSTING_MODES,
  SESSION_KINDS,
  VISIBILITIES,
  printSession,
  resolveStartDefaultsAndDestination,
  sessionUiPath,
  startSessionWithRetry,
} from "./shared.js";

export const sessionStartCommand = defineCommand({
  path: ["session", "start"],
  description: "Start a new session group or add a session to an explicit group",
  examples: [
    '"$TRACE_CLI" session start "Implement the API tests" --json',
    '"$TRACE_CLI" session start "Fix the login flow" --channel <channel-id> --tool codex --json',
    '"$TRACE_CLI" session start "Review this work" --group <group-id> --json',
  ],
  effects: [
    "Creates a session and, unless --group is supplied, creates a new session group.",
    "A prompt requests the initial run in the same operation.",
  ],
  output: "The new session, whether an initial run was requested, its UI path, and an idempotency key.",
  nextSteps: [
    'Run "$TRACE_CLI" session events <session-id> --limit 50 --json to monitor progress.',
    'Use "$TRACE_CLI" session send <session-id> "<message>" --queue --json for follow-up work.',
  ],
  notes: [
    "A new coding group needs a channel or repository; omitted values inherit from the current session when available.",
    "Do not call session run with the same initial prompt, because that can duplicate the work.",
  ],
  positionals: [{ name: "prompt", variadic: true }],
  options: [
    {
      name: "group",
      flag: "--group",
      kind: "string",
      valueName: "ID",
      description: "Add the session to an existing group",
    },
    {
      name: "channel",
      flag: "--channel",
      kind: "string",
      valueName: "ID",
      description: "Create the group in this channel",
    },
    {
      name: "repo",
      flag: "--repo",
      kind: "string",
      valueName: "ID",
      description: "Use this repository",
    },
    {
      name: "tool",
      flag: "--tool",
      kind: "string",
      valueName: "TOOL",
      choices: CODING_TOOLS,
      description: "Coding tool",
    },
    {
      name: "model",
      flag: "--model",
      kind: "string",
      valueName: "MODEL",
      description: "Model override",
    },
    {
      name: "reasoning",
      flag: "--reasoning",
      kind: "string",
      valueName: "EFFORT",
      description: "Reasoning effort override",
    },
    {
      name: "hosting",
      flag: "--hosting",
      kind: "string",
      valueName: "MODE",
      choices: HOSTING_MODES,
      description: "Hosting mode",
    },
    {
      name: "runtime",
      flag: "--runtime",
      kind: "string",
      valueName: "ID",
      description: "Runtime instance",
    },
    {
      name: "environment",
      flag: "--environment",
      kind: "string",
      valueName: "ID",
      description: "Environment",
    },
    {
      name: "branch",
      flag: "--branch",
      kind: "string",
      valueName: "NAME",
      description: "Git branch",
    },
    {
      name: "ticket",
      flag: "--ticket",
      kind: "string",
      valueName: "ID",
      description: "Linked ticket",
    },
    {
      name: "kind",
      flag: "--kind",
      kind: "string",
      valueName: "KIND",
      choices: SESSION_KINDS,
      description: "Session group kind",
    },
    {
      name: "visibility",
      flag: "--visibility",
      kind: "string",
      valueName: "VISIBILITY",
      choices: VISIBILITIES,
      description: "Session group visibility",
    },
    {
      name: "interactionMode",
      flag: "--interaction-mode",
      kind: "string",
      valueName: "MODE",
      description: "Initial interaction mode",
    },
    {
      name: "prompt",
      flag: "--prompt",
      kind: "string",
      valueName: "PROMPT",
      description: "Initial prompt",
    },
    {
      name: "idempotencyKey",
      flag: "--idempotency-key",
      kind: "string",
      valueName: "KEY",
      description: "Retry-safe mutation key",
    },
    { name: "defer", flag: "--defer", kind: "boolean", description: "Defer runtime selection" },
  ],
  async run(ctx, parsed) {
    const input: StartSessionInput = {
      sessionGroupId: optionString(parsed, "group"),
      channelId: optionString(parsed, "channel"),
      repoId: optionString(parsed, "repo"),
      tool: optionString(parsed, "tool") as CodingTool | undefined,
      model: optionString(parsed, "model"),
      reasoningEffort: optionString(parsed, "reasoning"),
      hosting: optionString(parsed, "hosting") as HostingMode | undefined,
      runtimeInstanceId: optionString(parsed, "runtime"),
      environmentId: optionString(parsed, "environment"),
      branch: optionString(parsed, "branch"),
      ticketId: optionString(parsed, "ticket"),
      kind: optionString(parsed, "kind") as SessionGroupKind | undefined,
      visibility: optionString(parsed, "visibility") as SessionGroupVisibility | undefined,
      interactionMode: optionString(parsed, "interactionMode"),
      prompt: optionString(parsed, "prompt"),
      clientMutationId: optionString(parsed, "idempotencyKey") ?? randomUUID(),
      deferRuntimeSelection: optionBoolean(parsed, "defer") || undefined,
    };
    const positionalPrompt = parsed.positionals.join(" ").trim();
    if (positionalPrompt) {
      if (input.prompt) usage("Provide the prompt either positionally or with --prompt, not both");
      input.prompt = positionalPrompt;
    }

    const hasGroup = parsed.providedOptions.has("group");
    const destinationOptions = ["channel", "repo"];
    const groupConfigurationOptions = [
      "kind",
      "hosting",
      "runtime",
      "environment",
      "branch",
      "visibility",
      "defer",
    ];
    if (hasGroup && destinationOptions.some((name) => parsed.providedOptions.has(name))) {
      usage("--group cannot be combined with --channel or --repo");
    }
    if (hasGroup && groupConfigurationOptions.some((name) => parsed.providedOptions.has(name))) {
      usage(
        "--group cannot be combined with --kind, --hosting, --runtime, --environment, --branch, --visibility, or --defer; sessions inherit those settings from their group",
      );
    }

    const client = await ctx.client();
    await resolveStartDefaultsAndDestination(client, input, ctx.env.TRACE_SESSION_ID);
    const result = await startSessionWithRetry(client, input);
    const runRequested = !!input.prompt;
    const uiPath = sessionUiPath(result.startSession);
    ctx.output(
      {
        session: result.startSession,
        runRequested,
        uiPath,
        idempotencyKey: input.clientMutationId,
      },
      [
        printSession(result.startSession),
        runRequested
          ? "Initial run requested; not_started may be shown while the runtime is provisioning."
          : "Session created without an initial run.",
        ...(uiPath ? [`Open: ${uiPath}`] : []),
      ].join("\n"),
    );
  },
});
