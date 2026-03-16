import type { Context } from "../context.js";
import type { ApiTokenProvider, SetApiTokenInput } from "@trace/gql";
import type { ApiTokenProvider as ApiTokenProviderEnum } from "@prisma/client";
import { apiTokenService } from "../services/api-token.js";

export const apiTokenQueries = {
  myApiTokens: (_: unknown, _args: Record<string, never>, ctx: Context) => {
    return apiTokenService.list(ctx.userId);
  },
};

export const apiTokenMutations = {
  setApiToken: (_: unknown, args: { input: SetApiTokenInput }, ctx: Context) => {
    return apiTokenService.set(
      ctx.userId,
      args.input.provider as unknown as ApiTokenProviderEnum,
      args.input.token,
    );
  },
  deleteApiToken: (_: unknown, args: { provider: ApiTokenProvider }, ctx: Context) => {
    return apiTokenService.delete(ctx.userId, args.provider as unknown as ApiTokenProviderEnum);
  },
};
