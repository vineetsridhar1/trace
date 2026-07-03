import type { Command } from "commander";
import type { Event } from "@trace/gql";
import { asJsonObject } from "@trace/shared";
import { resolveServerUrl } from "../config.js";
import {
  CHANNEL_EVENTS_SUBSCRIPTION,
  CHAT_EVENTS_SUBSCRIPTION,
  ORG_EVENTS_TAIL_SUBSCRIPTION,
  SESSION_EVENTS_SUBSCRIPTION,
} from "../documents.js";
import { requireActiveOrg, resolveChannelByName } from "../resolve.js";
import { createClientRuntime } from "../runtime.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function eventPreview(event: Event): string {
  const payload = asJsonObject(event.payload);
  const preview =
    typeof payload?.text === "string"
      ? payload.text
      : typeof payload?.type === "string"
        ? payload.type
        : "";
  const flat = preview.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}...` : flat;
}

export function eventToLine(event: Event): string {
  const stamp = event.timestamp.slice(11, 19);
  const actor = event.actor?.name ?? event.actor?.id ?? "?";
  const preview = eventPreview(event);
  return `[${stamp}] ${event.eventType} ${event.scopeType}:${event.scopeId} ${actor}${preview ? ` — ${preview}` : ""}`;
}

async function resolveTailSubscription(
  serverUrl: string,
  orgId: string,
  scope: string | undefined,
  types: string[] | undefined,
): Promise<{
  document: typeof ORG_EVENTS_TAIL_SUBSCRIPTION;
  variables: Record<string, unknown>;
  field: string;
  clientTypes: string[] | null;
}> {
  if (!scope) {
    return {
      document: ORG_EVENTS_TAIL_SUBSCRIPTION,
      variables: { organizationId: orgId, types },
      field: "orgEvents",
      clientTypes: null,
    };
  }
  const [scopeType, ...rest] = scope.split(":");
  const scopeId = rest.join(":");
  if (!scopeType || !scopeId) {
    throw new Error(`Invalid --scope "${scope}". Use <type>:<id>, e.g. session:<id>.`);
  }
  switch (scopeType) {
    case "session":
      // sessionEvents has no server-side types argument; filter client-side.
      return {
        document: SESSION_EVENTS_SUBSCRIPTION,
        variables: { sessionId: scopeId, organizationId: orgId },
        field: "sessionEvents",
        clientTypes: types ?? null,
      };
    case "channel": {
      const channelId = UUID_RE.test(scopeId)
        ? scopeId
        : (await resolveChannelByName(serverUrl, orgId, scopeId)).id;
      return {
        document: CHANNEL_EVENTS_SUBSCRIPTION,
        variables: { channelId, organizationId: orgId, types },
        field: "channelEvents",
        clientTypes: null,
      };
    }
    case "chat":
      return {
        document: CHAT_EVENTS_SUBSCRIPTION,
        variables: { chatId: scopeId, types },
        field: "chatEvents",
        clientTypes: null,
      };
    default:
      throw new Error(`Unknown scope type "${scopeType}". Valid: session, channel, chat.`);
  }
}

export function registerEventCommands(program: Command): void {
  const events = program.command("events").description("Work with the event stream");

  events
    .command("tail")
    .description("Stream events live (org-wide, or a single scope)")
    .option("--scope <scope>", "scope as <type>:<id> (session, channel by id/name, chat)")
    .option("--types <types>", "comma-separated event types (server-side where supported)")
    .action(async (opts: { scope?: string; types?: string }, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const serverUrl = resolveServerUrl(globals.server as string | undefined);
      const orgId = requireActiveOrg();
      const types = opts.types
        ? opts.types
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined;

      const target = await resolveTailSubscription(serverUrl, orgId, opts.scope, types);
      const runtime = createClientRuntime({
        serverUrl,
        // Reconnect notices go to stderr only, so NDJSON consumers stay parseable.
        onConnectionChange: (state) => console.error(`# ${state}`),
      });
      await runtime.start({ orgEvents: false });

      const subscription = runtime.gql
        .subscription(target.document, target.variables)
        .subscribe((result) => {
          if (result.error) {
            console.error(`# subscription error: ${result.error.message}`);
            return;
          }
          const event = (result.data as Record<string, Event> | undefined)?.[target.field];
          if (!event) return;
          if (target.clientTypes && !target.clientTypes.includes(event.eventType)) return;
          console.log(globals.json ? JSON.stringify(event) : eventToLine(event));
        });

      await new Promise<void>((resolve) => {
        process.once("SIGINT", () => resolve());
      });
      subscription.unsubscribe();
      await runtime.dispose();
    });
}
