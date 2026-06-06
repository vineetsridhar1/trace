import { createHash } from "crypto";
import type { CodingTool, Prisma } from "@prisma/client";
import {
  getAutoEligibleModelsForTool,
  getAutoFallbackModelForTool,
  getAutoRouterModelForTool,
  getModelLabel,
  isSupportedModel,
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
  selectedModel?: string;
  reasonCode: string;
};

export type ModelRouterSettings = {
  enabled: boolean;
  routerModelByTool: Record<string, string>;
  fallbackModelByTool: Record<string, string>;
  allowedModelsByTool: Record<string, string[]>;
  prompt: string;
  rules: ModelRouterRule[];
  cacheTtlSeconds: number;
};

export type ModelRouterDecision = {
  selectedModel: string;
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
};

type CachedDecision = {
  expiresAt: number;
  decision: ModelRouterDecision;
};

export const DEFAULT_ROUTER_PROMPT = `Classify the user's coding task for model routing.
Return compact JSON with these fields only:
complexity: simple | moderate | complex | expert
risk: low | medium | high
confidence: low | medium | high
reasonCode: short snake_case reason
explanation: short user-visible phrase
selectedModel: one of the allowed model ids or null

Prefer cheaper models for simple, low-risk tasks. Use stronger models for broad refactors, debugging unclear failures, architecture, security, migrations, auth, payments, or large-context work.`;

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
      match: ["security", "auth", "payment", "billing", "migration", "prisma migrate"],
      complexity: "complex",
      risk: "high",
      reasonCode: "protected_domain",
    },
    {
      id: "large_change",
      description: "Use stronger models for broad refactors and architecture work.",
      match: ["refactor", "architecture", "redesign", "rewrite", "debug failing tests"],
      complexity: "complex",
      risk: "medium",
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

function strongestAllowedModel(tool: CodingTool, allowedModels: string[]): string | null {
  const supported = getAutoEligibleModelsForTool(tool).map((model) => model.value);
  return supported.find((model) => allowedModels.includes(model)) ?? null;
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
  const strong = strongestAllowedModel(input.tool, allowedModels);
  const selected =
    rule.selectedModel &&
    allowedModels.includes(rule.selectedModel) &&
    isSupportedModel(input.tool, rule.selectedModel)
      ? rule.selectedModel
      : rule.risk === "high" || rule.complexity === "complex" || rule.complexity === "expert"
        ? (strong ?? fallback)
        : fallback;
  if (!selected) return null;

  return {
    selectedModel: selected,
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

function decisionFromClassifier(
  raw: Record<string, unknown>,
  tool: CodingTool,
  allowedModels: string[],
  fallback: string,
  routerModel: string,
): ModelRouterDecision {
  const selected =
    typeof raw.selectedModel === "string" &&
    allowedModels.includes(raw.selectedModel) &&
    isSupportedModel(tool, raw.selectedModel)
      ? raw.selectedModel
      : fallback;
  const complexity = parseComplexity(raw.complexity) ?? "moderate";
  const risk = parseRisk(raw.risk) ?? "medium";
  const confidence = parseConfidence(raw.confidence) ?? "medium";
  const reasonCode = typeof raw.reasonCode === "string" ? raw.reasonCode : "router_classified";
  const explanation =
    typeof raw.explanation === "string" && raw.explanation.trim()
      ? raw.explanation.trim()
      : `${complexity} task`;

  return {
    selectedModel: selected,
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
): ModelRouterDecision {
  const selected =
    bestFallback(tool, settings, allowedModels) ?? getAutoEligibleModelsForTool(tool)[0]?.value;
  if (!selected) {
    throw new Error(`No auto fallback model is available for tool "${tool}"`);
  }
  return {
    selectedModel: selected,
    complexity: "moderate",
    risk: "medium",
    confidence: "low",
    reasonCode,
    explanation: `Fallback to ${getModelLabel(selected)}`,
    routerModel: settings.routerModelByTool[tool] ?? null,
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
    const routerModel =
      settings.routerModelByTool[input.tool] ?? getAutoRouterModelForTool(input.tool);
    if (!routerModel) {
      return fallbackDecision(input.tool, settings, allowedModels, "router_model_missing");
    }

    try {
      const response = await aiService.complete({
        organizationId: input.organizationId,
        userId: input.userId,
        model: routerModel,
        system: settings.prompt,
        maxTokens: 220,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              tool: input.tool,
              allowedModels,
              fallbackModel: fallback,
              repo: input.repo,
              prompt: input.prompt,
            }),
          },
        ],
      });
      const text = firstTextBlock(response.content);
      const parsed = text ? parseRouterJson(text) : null;
      const decision = parsed
        ? decisionFromClassifier(parsed, input.tool, allowedModels, fallback, routerModel)
        : fallbackDecision(input.tool, settings, allowedModels, "fallback");

      if (!decision.fallback && decision.risk !== "high") {
        decisionCache.set(key, {
          expiresAt: now + settings.cacheTtlSeconds * 1000,
          decision,
        });
      }
      return decision;
    } catch {
      return fallbackDecision(input.tool, settings, allowedModels, "fallback");
    }
  }
}

export const modelRouterService = new ModelRouterService();
