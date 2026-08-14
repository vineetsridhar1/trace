import type { Context } from "../context.js";
import type { CodexAuthMethod, SetCodexCredentialInput } from "@trace/gql";
import { codexCredentialService } from "../services/codex-credential.js";

export const codexCredentialQueries = {
  myCodexCredential: (_: unknown, _args: Record<string, never>, ctx: Context) =>
    codexCredentialService.getStatus(ctx.userId),
};

export const codexCredentialMutations = {
  setCodexCredential: (_: unknown, args: { input: SetCodexCredentialInput }, ctx: Context) =>
    codexCredentialService.set(
      ctx.userId,
      args.input.method as CodexAuthMethod,
      args.input.credential,
    ),
  deleteCodexCredential: (_: unknown, _args: Record<string, never>, ctx: Context) =>
    codexCredentialService.delete(ctx.userId),
};
