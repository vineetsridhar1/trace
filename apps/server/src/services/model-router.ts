import { createHash } from "crypto";
import type { CodingTool, Prisma } from "@prisma/client";
import {
  getAutoEligibleModelsForTool,
  getAutoFallbackModelForTool,
  getAutoModelTiersForTool,
  getAutoRouterModelForTool,
  getModelLabel,
  isSupportedModel,
  MODEL_ROUTING_TIERS,
  type ModelRoutingTier,
  type ModelRoutingTierModels,
} from "@trace/shared";
import { aiService } from "./ai.js";

export type ModelRoutingComplexity = "simple" | "moderate" | "complex" | "expert";
export type ModelRoutingRisk = "low" | "medium" | "high";
export type ModelRoutingConfidence = "low" | "medium" | "high";

export type ModelRouterRule = {
  id: string;
  description: string;
  match: string[];
  complexity?: ModelRoutingComplexity;
  risk?: ModelRoutingRisk;
  tier?: ModelRoutingTier;
  selectedModel?: string;
  reasonCode: string;
};

export type ModelRouterSettings = {
  enabled: boolean;
  routerModelByTool: Record<string, string>;
  modelTiersByTool: Record<string, ModelRoutingTierModels>;
  fallbackModelByTool: Record<string, string>;
  allowedModelsByTool: Record<string, string[]>;
  prompt: string;
  rules: ModelRouterRule[];
  cacheTtlSeconds: number;
};

export type ModelRouterDecision = {
  selectedModel: string;
  tier: ModelRoutingTier;
  complexity: ModelRoutingComplexity;
  risk: ModelRoutingRisk;
  confidence: ModelRoutingConfidence;
  reasonCode: string;
  explanation: string;
  routerModel: string | null;
  cacheHit: boolean;
  fallback: boolean;
};

type ModelRouterInput = {
  organizationId: string;
  userId: string;
  tool: CodingTool;
  prompt: string;
  organizationSettings?: Prisma.JsonValue | null;
  repo?: { id: string; name: string; defaultBranch?: string | null } | null;
  toolClassifier?: (prompt: string) => Promise<string>;
};

type CachedDecision = {
  expiresAt: number;
  decision: ModelRouterDecision;
};

const ROUTER_OUTPUT_CONTRACT = `Classify the user's coding task for model routing.
Return compact JSON with these fields only:
complexity: simple | moderate | complex | expert
risk: low | medium | high
confidence: low | medium | high
tier: fast | balanced | high_thinking
reasonCode: short snake_case reason
explanation: short user-visible phrase

Return only a JSON object. Do not use markdown.`;

const FALLBACK_ROUTER_MODELS = ["gpt-4o-mini", "claude-3-5-haiku-latest"] as const;

export const DEFAULT_ROUTER_PROMPT = `Use fast for simple low-risk tasks. Use balanced for moderate code changes and normal repo work. Use high_thinking for broad refactors, debugging unclear failures, architecture, security, migrations, auth, payments, or large-context work.`;

export const DEFAULT_MODEL_ROUTER_SETTINGS: ModelRouterSettings = {
  enabled: true,
  routerModelByTool: {
    claude_code: getAutoRouterModelForTool("claude_code") ?? "claude-haiku-4-5",
    codex: getAutoRouterModelForTool("codex") ?? "gpt-5.1-codex-mini",
    pi: getAutoRouterModelForTool("pi") ?? "gpt-5.1-codex-mini",
  },
  fallbackModelByTool: {
    claude_code: getAutoFallbackModelForTool("claude_code") ?? "claude-haiku-4-5",
    codex: getAutoFallbackModelForTool("codex") ?? "gpt-5.1-codex-mini",
    pi: getAutoFallbackModelForTool("pi") ?? "openai/gpt-5.4",
  },
  modelTiersByTool: {
    claude_code: getAutoModelTiersForTool("claude_code") ?? {
      fast: "claude-haiku-4-5",
      balanced: "claude-sonnet-4-6",
      high_thinking: "claude-opus-4-8[1m]",
    },
    codex: getAutoModelTiersForTool("codex") ?? {
      fast: "gpt-5.1-codex-mini",
      balanced: "gpt-5.3-codex",
      high_thinking: "gpt-5.5",
    },
    pi: getAutoModelTiersForTool("pi") ?? {
      fast: "openai/gpt-5.4",
      balanced: "anthropic/claude-sonnet-4-6",
      high_thinking: "anthropic/claude-opus-4-7",
    },
  },
  allowedModelsByTool: {
    claude_code: getAutoEligibleModelsForTool("claude_code").map((model) => model.value),
    codex: getAutoEligibleModelsForTool("codex").map((model) => model.value),
    pi: getAutoEligibleModelsForTool("pi").map((model) => model.value),
  },
  prompt: DEFAULT_ROUTER_PROMPT,
  rules: [
    {
      id: "protected_domains",
      description: "Use stronger models for security, auth, payment, and migration work.",
      match: [
        "security",
        "auth",
        "login",
        "oauth",
        "password",
        "payment",
        "billing",
        "migration",
        "prisma migrate",
      ],
      complexity: "complex",
      risk: "high",
      tier: "high_thinking",
      reasonCode: "protected_domain",
    },
    {
      id: "large_change",
      description: "Use stronger models for broad refactors and architecture work.",
      match: ["refactor", "architecture", "redesign", "rewrite", "debug failing tests"],
      complexity: "complex",
      risk: "medium",
      tier: "high_thinking",
      reasonCode: "large_code_change",
    },
  ],
  cacheTtlSeconds: 60 * 60,
};

const decisionCache = new Map<string, CachedDecision>();

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) return {};
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (typeof raw === "string" && raw.trim()) result[key] = raw;
  }
  return result;
}

function stringArrayRecord(value: unknown): Record<string, string[]> {
  const record = asRecord(value);
  if (!record) return {};
  const result: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (Array.isArray(raw) && raw.every((item) => typeof item === "string")) {
      result[key] = raw;
    }
  }
  return result;
}

function parseTier(value: unknown): ModelRoutingTier | undefined {
  return typeof value === "string" &&
    (MODEL_ROUTING_TIERS as readonly string[]).includes(value)
    ? (value as ModelRoutingTier)
    : undefined;
}

function parseTierModels(value: unknown): ModelRoutingTierModels | null {
  const record = asRecord(value);
  if (!record) return null;
  const fast = typeof record.fast === "string" ? record.fast : null;
  const balanced = typeof record.balanced === "string" ? record.balanced : null;
  const highThinking =
    typeof record.high_thinking === "string"
      ? record.high_thinking
      : typeof record.highThinking === "string"
        ? record.highThinking
        : null;
  if (!fast || !balanced || !highThinking) return null;
  return { fast, balanced, high_thinking: highThinking };
}

function tierModelsRecord(value: unknown): Record<string, ModelRoutingTierModels> {
  const record = asRecord(value);
  if (!record) return {};
  const result: Record<string, ModelRoutingTierModels> = {};
  for (const [tool, raw] of Object.entries(record)) {
    const tiers = parseTierModels(raw);
    if (tiers) result[tool] = tiers;
  }
  return result;
}

function parseRule(value: unknown): ModelRouterRule | null {
  const rule = asRecord(value);
  if (!rule || typeof rule.id !== "string" || typeof rule.reasonCode !== "string") return null;
  const match = Array.isArray(rule.match)
    ? rule.match.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];
  if (match.length === 0) return null;
  return {
    id: rule.id,
    description: typeof rule.description === "string" ? rule.description : rule.id,
    match,
    complexity: parseComplexity(rule.complexity),
    risk: parseRisk(rule.risk),
    tier: parseTier(rule.tier),
    selectedModel: typeof rule.selectedModel === "string" ? rule.selectedModel : undefined,
    reasonCode: rule.reasonCode,
  };
}

function mergeSettings(settings: Prisma.JsonValue | null | undefined): ModelRouterSettings {
  const root = asRecord(settings);
  const router = asRecord(root?.modelRouter);
  if (!router) return DEFAULT_MODEL_ROUTER_SETTINGS;

  const rules = Array.isArray(router.rules)
    ? router.rules.map(parseRule).filter((rule): rule is ModelRouterRule => rule !== null)
    : DEFAULT_MODEL_ROUTER_SETTINGS.rules;

  return {
    enabled:
      typeof router.enabled === "boolean" ? router.enabled : DEFAULT_MODEL_ROUTER_SETTINGS.enabled,
    routerModelByTool: {
      ...DEFAULT_MODEL_ROUTER_SETTINGS.routerModelByTool,
      ...stringRecord(router.routerModelByTool),
    },
    modelTiersByTool: {
      ...DEFAULT_MODEL_ROUTER_SETTINGS.modelTiersByTool,
      ...tierModelsRecord(router.modelTiersByTool),
    },
    fallbackModelByTool: {
      ...DEFAULT_MODEL_ROUTER_SETTINGS.fallbackModelByTool,
      ...stringRecord(router.fallbackModelByTool),
    },
    allowedModelsByTool: {
      ...DEFAULT_MODEL_ROUTER_SETTINGS.allowedModelsByTool,
      ...stringArrayRecord(router.allowedModelsByTool),
    },
    prompt:
      typeof router.prompt === "string" && router.prompt.trim()
        ? router.prompt
        : DEFAULT_ROUTER_PROMPT,
    rules,
    cacheTtlSeconds:
      typeof router.cacheTtlSeconds === "number" && router.cacheTtlSeconds > 0
        ? Math.min(router.cacheTtlSeconds, 24 * 60 * 60)
        : DEFAULT_MODEL_ROUTER_SETTINGS.cacheTtlSeconds,
  };
}

function parseComplexity(value: unknown): ModelRoutingComplexity | undefined {
  return value === "simple" || value === "moderate" || value === "complex" || value === "expert"
    ? value
    : undefined;
}

function parseRisk(value: unknown): ModelRoutingRisk | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function parseConfidence(value: unknown): ModelRoutingConfidence | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cacheKey(input: ModelRouterInput, settings: ModelRouterSettings, allowedModels: string[]) {
  return hashJson({
    organizationId: input.organizationId,
    tool: input.tool,
    prompt: input.prompt.trim().toLowerCase(),
    settings: {
      prompt: settings.prompt,
      rules: settings.rules,
      fallbackModel: settings.fallbackModelByTool[input.tool],
      modelTiers: settings.modelTiersByTool[input.tool],
      routerModel: settings.routerModelByTool[input.tool],
      allowedModels,
    },
    repo: input.repo ? { id: input.repo.id, defaultBranch: input.repo.defaultBranch } : null,
  });
}

function bestFallback(tool: CodingTool, settings: ModelRouterSettings, allowedModels: string[]) {
  const configured = settings.fallbackModelByTool[tool];
  if (configured && allowedModels.includes(configured) && isSupportedModel(tool, configured)) {
    return configured;
  }
  const helper = getAutoFallbackModelForTool(tool);
  if (helper && allowedModels.includes(helper) && isSupportedModel(tool, helper)) return helper;
  return allowedModels.find((model) => isSupportedModel(tool, model)) ?? null;
}

function routerModelCandidates(tool: CodingTool, settings: ModelRouterSettings): string[] {
  const candidates = [
    settings.routerModelByTool[tool],
    getAutoRouterModelForTool(tool),
    ...FALLBACK_ROUTER_MODELS,
  ];
  return candidates.filter(
    (model, index): model is string =>
      typeof model === "string" && model.trim() !== "" && candidates.indexOf(model) === index,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown router error";
}

function isMissingApiKeyError(message: string): boolean {
  return /No (openai|anthropic) API key configured/i.test(message);
}

function tierForClassification(
  complexity: ModelRoutingComplexity,
  risk: ModelRoutingRisk,
): ModelRoutingTier {
  if (risk === "high" || complexity === "complex" || complexity === "expert") {
    return "high_thinking";
  }
  if (risk === "low" && complexity === "simple") return "fast";
  return "balanced";
}

function modelForTier(
  tool: CodingTool,
  settings: ModelRouterSettings,
  allowedModels: string[],
  tier: ModelRoutingTier,
): string | null {
  const configured = settings.modelTiersByTool[tool]?.[tier];
  if (configured && allowedModels.includes(configured) && isSupportedModel(tool, configured)) {
    return configured;
  }
  const defaultConfigured = getAutoModelTiersForTool(tool)?.[tier];
  if (
    defaultConfigured &&
    allowedModels.includes(defaultConfigured) &&
    isSupportedModel(tool, defaultConfigured)
  ) {
    return defaultConfigured;
  }
  if (tier !== "balanced") {
    const balanced = settings.modelTiersByTool[tool]?.balanced;
    if (balanced && allowedModels.includes(balanced) && isSupportedModel(tool, balanced)) {
      return balanced;
    }
  }
  return bestFallback(tool, settings, allowedModels);
}

function ruleDecision(
  input: ModelRouterInput,
  settings: ModelRouterSettings,
  allowedModels: string[],
): ModelRouterDecision | null {
  const prompt = input.prompt.toLowerCase();
  const rule = settings.rules.find((candidate) =>
    candidate.match.some((needle) => prompt.includes(needle.toLowerCase())),
  );
  if (!rule) return null;

  const fallback = bestFallback(input.tool, settings, allowedModels);
  const tier =
    rule.tier ??
    tierForClassification(rule.complexity ?? "moderate", rule.risk ?? "medium");
  const selected =
    rule.selectedModel &&
    allowedModels.includes(rule.selectedModel) &&
    isSupportedModel(input.tool, rule.selectedModel)
      ? rule.selectedModel
      : (modelForTier(input.tool, settings, allowedModels, tier) ?? fallback);
  if (!selected) return null;

  return {
    selectedModel: selected,
    tier,
    complexity: rule.complexity ?? "moderate",
    risk: rule.risk ?? "medium",
    confidence: "high",
    reasonCode: rule.reasonCode,
    explanation: rule.description,
    routerModel: null,
    cacheHit: false,
    fallback: false,
  };
}

function heuristicDecision(
  input: ModelRouterInput,
  settings: ModelRouterSettings,
  allowedModels: string[],
  reasonCode: string,
  explanation: string,
): ModelRouterDecision | null {
  const prompt = input.prompt.toLowerCase();
  const complexity: ModelRoutingComplexity =
    prompt.includes("debug") ||
    prompt.includes("failing") ||
    prompt.includes("implement") ||
    prompt.includes("update") ||
    prompt.includes("build")
      ? "moderate"
      : "simple";
  const risk: ModelRoutingRisk =
    prompt.includes("auth") ||
    prompt.includes("login") ||
    prompt.includes("security") ||
    prompt.includes("payment") ||
    prompt.includes("migration")
      ? "high"
      : "low";
  const tier = tierForClassification(complexity, risk);
  const selected = modelForTier(input.tool, settings, allowedModels, tier);
  if (!selected) return null;

  return {
    selectedModel: selected,
    tier,
    complexity,
    risk,
    confidence: "low",
    reasonCode,
    explanation,
    routerModel: null,
    cacheHit: false,
    fallback: false,
  };
}

function parseRouterJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const jsonText =
    trimmed.startsWith("{") && trimmed.endsWith("}")
      ? trimmed
      : (trimmed.match(/\{[\s\S]*\}/)?.[0] ?? "");
  if (!jsonText) return null;
  try {
    const parsed: unknown = JSON.parse(jsonText);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function firstTextBlock(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    const record = asRecord(block);
    if (record?.type === "text" && typeof record.text === "string") {
      return record.text;
    }
  }
  return null;
}

function classifierPrompt(input: ModelRouterInput, settings: ModelRouterSettings, fallback: string) {
  return `${ROUTER_OUTPUT_CONTRACT}

Routing guidance:
${settings.prompt}

Classify this task. Do not modify files or run tools. Return only the JSON object.

${JSON.stringify({
  tool: input.tool,
  tiers: settings.modelTiersByTool[input.tool],
  fallbackModel: fallback,
  repo: input.repo,
  prompt: input.prompt,
})}`;
}

function decisionFromClassifier(
  raw: Record<string, unknown>,
  tool: CodingTool,
  settings: ModelRouterSettings,
  allowedModels: string[],
  fallback: string,
  routerModel: string,
): ModelRouterDecision {
  const complexity = parseComplexity(raw.complexity) ?? "moderate";
  const risk = parseRisk(raw.risk) ?? "medium";
  const tier = parseTier(raw.tier) ?? tierForClassification(complexity, risk);
  const selected = modelForTier(tool, settings, allowedModels, tier) ?? fallback;
  const confidence = parseConfidence(raw.confidence) ?? "medium";
  const reasonCode = typeof raw.reasonCode === "string" ? raw.reasonCode : "router_classified";
  const explanation =
    typeof raw.explanation === "string" && raw.explanation.trim()
      ? raw.explanation.trim()
      : `${complexity} task`;

  return {
    selectedModel: selected,
    tier,
    complexity,
    risk,
    confidence,
    reasonCode,
    explanation,
    routerModel,
    cacheHit: false,
    fallback: false,
  };
}

function fallbackDecision(
  tool: CodingTool,
  settings: ModelRouterSettings,
  allowedModels: string[],
  reasonCode: string,
  explanation?: string,
  routerModel?: string | null,
): ModelRouterDecision {
  const selected =
    bestFallback(tool, settings, allowedModels) ?? getAutoEligibleModelsForTool(tool)[0]?.value;
  if (!selected) {
    throw new Error(`No auto fallback model is available for tool "${tool}"`);
  }
  return {
    selectedModel: selected,
    tier: "fast",
    complexity: "moderate",
    risk: "medium",
    confidence: "low",
    reasonCode,
    explanation: explanation ?? `Fallback to ${getModelLabel(selected)}`,
    routerModel: routerModel ?? settings.routerModelByTool[tool] ?? null,
    cacheHit: false,
    fallback: true,
  };
}

export class ModelRouterService {
  resolveSettings(settings: Prisma.JsonValue | null | undefined): ModelRouterSettings {
    return mergeSettings(settings);
  }

  async route(input: ModelRouterInput): Promise<ModelRouterDecision> {
    const settings = mergeSettings(input.organizationSettings);
    const allowedModels = (settings.allowedModelsByTool[input.tool] ?? []).filter((model) =>
      isSupportedModel(input.tool, model),
    );

    if (!settings.enabled || allowedModels.length === 0) {
      return fallbackDecision(input.tool, settings, allowedModels, "router_disabled");
    }

    const deterministic = ruleDecision(input, settings, allowedModels);
    if (deterministic) return deterministic;

    const key = cacheKey(input, settings, allowedModels);
    const cached = decisionCache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return { ...cached.decision, cacheHit: true };
    }

    const fallback = bestFallback(input.tool, settings, allowedModels);
    if (!fallback) {
      return fallbackDecision(input.tool, settings, allowedModels, "fallback");
    }

    if (input.toolClassifier) {
      try {
        const text = await input.toolClassifier(classifierPrompt(input, settings, fallback));
        const parsed = parseRouterJson(text);
        if (parsed) {
          return decisionFromClassifier(
            parsed,
            input.tool,
            settings,
            allowedModels,
            fallback,
            "tool_adapter",
          );
        }
      } catch {
        // Fall through to direct LLM router / heuristic fallback.
      }
    }

    const routerModels = routerModelCandidates(input.tool, settings);
    if (routerModels.length === 0) {
      return fallbackDecision(input.tool, settings, allowedModels, "router_model_missing");
    }

    const failures: Array<{ reasonCode: string; message: string; routerModel: string }> = [];
    for (const routerModel of routerModels) {
      try {
        const response = await aiService.complete({
          organizationId: input.organizationId,
          userId: input.userId,
          model: routerModel,
          system: `${ROUTER_OUTPUT_CONTRACT}\n\nRouting guidance:\n${settings.prompt}`,
          maxTokens: 220,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: classifierPrompt(input, settings, fallback),
            },
          ],
        });
        const text = firstTextBlock(response.content);
        const parsed = text ? parseRouterJson(text) : null;
        if (!parsed) {
          failures.push({
            reasonCode: "router_parse_failed",
            message: "Router did not return valid JSON",
            routerModel,
          });
          continue;
        }

        const decision = decisionFromClassifier(
          parsed,
          input.tool,
          settings,
          allowedModels,
          fallback,
          routerModel,
        );

        if (!decision.fallback && decision.risk !== "high") {
          decisionCache.set(key, {
            expiresAt: now + settings.cacheTtlSeconds * 1000,
            decision,
          });
        }
        return decision;
      } catch (error) {
        failures.push({
          reasonCode: "router_error",
          message: errorMessage(error),
          routerModel,
        });
      }
    }

    const missingApiKeys =
      failures.length > 0 && failures.every((failure) => isMissingApiKeyError(failure.message));
    if (missingApiKeys) {
      const heuristic = heuristicDecision(
        input,
        settings,
        allowedModels,
        "router_api_key_missing",
        "Router API key missing; selected by local heuristic",
      );
      if (heuristic) return heuristic;
    }

    const lastFailure = failures[failures.length - 1] ?? null;
    return fallbackDecision(
      input.tool,
      settings,
      allowedModels,
      lastFailure?.reasonCode ?? "router_error",
      lastFailure ? `Router failed: ${lastFailure.message}` : undefined,
      lastFailure?.routerModel ?? routerModels[0] ?? null,
    );
  }
}

export const modelRouterService = new ModelRouterService();
