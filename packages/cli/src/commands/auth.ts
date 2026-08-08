import { randomUUID } from "node:crypto";
import { TraceClient } from "../client.js";
import { deleteStoredCredential, writeConfig, writeStoredCredential } from "../config.js";
import { ExitCode, CliError, usage } from "../errors.js";
import { defaultDeviceName, promptPairingCode, type Command } from "../runtime.js";

type MeResponse = {
  user: {
    id: string;
    email: string;
    name: string | null;
    orgMemberships: Array<{
      organizationId: string;
      role: string;
      organization: { id: string; name: string };
    }>;
  };
};

export const authCommands: Command[] = [
  {
    path: ["auth", "pair"],
    usage: "trace auth pair [pairing-code] [--server URL] [--name NAME] [--json]",
    description: "Pair this CLI with a signed-in Trace account",
    async run(ctx) {
      let code: string | undefined;
      let deviceName = defaultDeviceName();
      for (let index = 2; index < ctx.args.length; index += 1) {
        if (ctx.args[index] === "--name") {
          deviceName = ctx.args[++index] || usage("--name requires a value");
        } else if (!code) {
          code = ctx.args[index];
        } else {
          usage(`Unexpected argument: ${ctx.args[index]}`);
        }
      }
      code = code?.trim() || (await promptPairingCode());
      if (!code) usage("Pairing code is required");

      const anonymous = new TraceClient(ctx.config.serverUrl, "");
      const result = await anonymous.http<{
        token: string;
        deviceId: string;
        organizationId: string;
      }>("/auth/client/pair", {
        method: "POST",
        body: {
          pairingToken: code,
          installId: ctx.config.installId || randomUUID(),
          deviceName,
          appVersion: "0.0.2",
        },
      });
      await writeStoredCredential(ctx.config.serverUrl, result.token, ctx.env);
      await writeConfig(
        {
          ...ctx.config,
          deviceId: result.deviceId,
          deviceName,
          activeOrganizationId: result.organizationId,
        },
        ctx.env,
      );
      ctx.output(
        {
          authenticated: true,
          serverUrl: ctx.config.serverUrl,
          organizationId: result.organizationId,
          deviceId: result.deviceId,
          deviceName,
        },
        `Paired ${deviceName} with ${ctx.config.serverUrl}`,
      );
    },
  },
  {
    path: ["auth", "status"],
    usage: "trace auth status [--json]",
    description: "Show the active authentication status",
    async run(ctx) {
      const client = await ctx.client(false);
      const result = await client.http<MeResponse>("/auth/me");
      const mode = ctx.env.TRACE_INVOCATION_TOKEN ? "session" : "human";
      ctx.output(
        {
          authenticated: true,
          mode,
          serverUrl: ctx.config.serverUrl,
          organizationId: client.organizationId ?? null,
          user: result.user,
        },
        `${result.user.name ?? result.user.email} (${mode} authentication)\nServer: ${ctx.config.serverUrl}`,
      );
    },
  },
  {
    path: ["auth", "logout"],
    usage: "trace auth logout [--json]",
    description: "Revoke this CLI device and remove its local credential",
    async run(ctx) {
      if (ctx.env.TRACE_INVOCATION_TOKEN) {
        throw new CliError(
          "Trace-managed session authentication cannot be logged out from inside the session",
          ExitCode.authorization,
          "authorization",
        );
      }
      const client = await ctx.client(false);
      await client.http<{ ok: boolean }>("/auth/logout", { method: "POST", body: {} });
      await deleteStoredCredential(ctx.config.serverUrl, ctx.env);
      ctx.output({ authenticated: false, revoked: true }, "Logged out and revoked this CLI device");
    },
  },
];

export type { MeResponse };
