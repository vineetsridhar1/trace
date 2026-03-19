import type { Context } from "../context.js";
import type { ApiTokenProvider, SetApiTokenInput } from "@trace/gql";
import type { ApiTokenProvider as ApiTokenProviderEnum } from "@prisma/client";
import { apiTokenService } from "../services/api-token.js";
import { aiService } from "../services/ai.js";

function isLLMTokenProvider(provider: ApiTokenProviderEnum): provider is "anthropic" | "openai" {
  return provider === "anthropic" || provider === "openai";
}

export const apiTokenQueries = {
  myApiTokens: (_: unknown, _args: Record<string, never>, ctx: Context) => {
    return apiTokenService.list(ctx.userId);
  },
};

export const apiTokenMutations = {
  setApiToken: async (_: unknown, args: { input: SetApiTokenInput }, ctx: Context) => {
    const provider = args.input.provider as unknown as ApiTokenProviderEnum;
    const result = await apiTokenService.set(ctx.userId, provider, args.input.token);
    if (isLLMTokenProvider(provider)) {
      aiService.invalidateAdapter(ctx.userId, provider);
    }
    return result;
  },
  deleteApiToken: async (_: unknown, args: { provider: ApiTokenProvider }, ctx: Context) => {
    const provider = args.provider as unknown as ApiTokenProviderEnum;
    const result = await apiTokenService.delete(ctx.userId, provider);
    if (isLLMTokenProvider(provider)) {
      aiService.invalidateAdapter(ctx.userId, provider);
    }
    return result;
  },
};
