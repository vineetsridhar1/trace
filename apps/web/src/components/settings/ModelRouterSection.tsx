import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { useAuthStore } from "@trace/client-core";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { getModelLabel, getModelsForTool } from "../session/modelOptions";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";

const MODEL_ROUTER_SETTINGS_QUERY = gql`
  query ModelRouterSettings($organizationId: ID!) {
    modelRouterSettings(organizationId: $organizationId) {
      enabled
      prompt
      defaultPrompt
      modelTiers {
        tool
        fast
        balanced
        highThinking
      }
      defaultModelTiers {
        tool
        fast
        balanced
        highThinking
      }
      cacheTtlSeconds
    }
  }
`;

const UPDATE_MODEL_ROUTER_SETTINGS_MUTATION = gql`
  mutation UpdateModelRouterSettings($input: UpdateModelRouterSettingsInput!) {
    updateModelRouterSettings(input: $input) {
      enabled
      prompt
      defaultPrompt
      modelTiers {
        tool
        fast
        balanced
        highThinking
      }
      defaultModelTiers {
        tool
        fast
        balanced
        highThinking
      }
      cacheTtlSeconds
    }
  }
`;

type ToolTiers = {
  tool: string;
  fast: string;
  balanced: string;
  highThinking: string;
};

type RouterSettings = {
  enabled: boolean;
  prompt: string;
  defaultPrompt: string;
  modelTiers: ToolTiers[];
  defaultModelTiers: ToolTiers[];
  cacheTtlSeconds: number;
};

const TOOL_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  pi: "Pi",
};

const TIER_LABELS: Array<{ key: keyof Omit<ToolTiers, "tool">; label: string }> = [
  { key: "fast", label: "Fast" },
  { key: "balanced", label: "Balanced" },
  { key: "highThinking", label: "High Thinking" },
];

function serializeTiers(tiers: ToolTiers[]) {
  return JSON.stringify(
    [...tiers].sort((a, b) => a.tool.localeCompare(b.tool)),
  );
}

export function ModelRouterSection() {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const orgMemberships = useAuthStore(
    (s: { orgMemberships: Array<{ organizationId: string; role: string }> }) => s.orgMemberships,
  );
  const isAdmin = useMemo(
    () =>
      orgMemberships.some(
        (membership) => membership.organizationId === activeOrgId && membership.role === "admin",
      ),
    [activeOrgId, orgMemberships],
  );
  const [settings, setSettings] = useState<RouterSettings | null>(null);
  const [prompt, setPrompt] = useState("");
  const [modelTiers, setModelTiers] = useState<ToolTiers[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!activeOrgId || !isAdmin) {
      setSettings(null);
      setPrompt("");
      setModelTiers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await client
        .query(
          MODEL_ROUTER_SETTINGS_QUERY,
          { organizationId: activeOrgId },
          { requestPolicy: "network-only" },
        )
        .toPromise();
      if (result.error) throw result.error;
      const nextSettings = result.data?.modelRouterSettings as RouterSettings | undefined;
      if (nextSettings) {
        setSettings(nextSettings);
        setPrompt(nextSettings.prompt);
        setModelTiers(nextSettings.modelTiers);
      }
    } catch (error) {
      toast.error("Failed to load model router settings", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, isAdmin]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const hasChanges = settings
    ? prompt.trim() !== settings.prompt ||
      serializeTiers(modelTiers) !== serializeTiers(settings.modelTiers)
    : false;

  const saveSettings = async (nextPrompt: string, nextModelTiers: ToolTiers[]) => {
    if (!activeOrgId || !isAdmin) return;
    const trimmedPrompt = nextPrompt.trim();
    if (!trimmedPrompt) {
      toast.error("Router prompt cannot be empty");
      return;
    }

    setSaving(true);
    try {
      const result = await client
        .mutation(UPDATE_MODEL_ROUTER_SETTINGS_MUTATION, {
          input: {
            organizationId: activeOrgId,
            prompt: trimmedPrompt,
            modelTiers: nextModelTiers,
          },
        })
        .toPromise();
      if (result.error) throw result.error;
      const nextSettings = result.data?.updateModelRouterSettings as RouterSettings | undefined;
      if (nextSettings) {
        setSettings(nextSettings);
        setPrompt(nextSettings.prompt);
        setModelTiers(nextSettings.modelTiers);
      }
      toast.success("Model router settings updated");
    } catch (error) {
      toast.error("Failed to update model router settings", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const updateTierModel = (
    tool: string,
    tier: keyof Omit<ToolTiers, "tool">,
    model: string,
  ) => {
    setModelTiers((current) =>
      current.map((entry) => (entry.tool === tool ? { ...entry, [tier]: model } : entry)),
    );
  };

  if (!isAdmin) {
    return (
      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-foreground">Model Router</h2>
          <p className="text-sm text-muted-foreground">
            Only organization admins can manage the Auto model router.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Model Router</h2>
        <p className="text-sm text-muted-foreground">
          Customize the prompt Auto uses and map each routing tier to a model per tool.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-surface-deep p-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading model router settings...</p>
        ) : settings ? (
          <>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-foreground">
                  Router Prompt
                </label>
                <span className="text-xs text-muted-foreground">
                  Cache TTL: {settings.cacheTtlSeconds}s
                </span>
              </div>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-h-[320px] resize-y font-mono text-sm leading-5"
                spellCheck={false}
              />
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <h3 className="text-sm font-medium text-foreground">Tier Models</h3>
                <p className="text-xs text-muted-foreground">
                  The router picks a tier, then Trace uses the matching model for the selected tool.
                </p>
              </div>

              <div className="space-y-4">
                {modelTiers.map((toolTiers) => {
                  const options = getModelsForTool(toolTiers.tool);
                  return (
                    <div
                      key={toolTiers.tool}
                      className="grid grid-cols-1 gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0 lg:grid-cols-[140px_1fr_1fr_1fr]"
                    >
                      <div className="text-sm font-medium text-foreground">
                        {TOOL_LABELS[toolTiers.tool] ?? toolTiers.tool}
                      </div>
                      {TIER_LABELS.map((tier) => (
                        <div key={tier.key}>
                          <label className="mb-1.5 block text-xs text-muted-foreground">
                            {tier.label}
                          </label>
                          <Select
                            value={toolTiers[tier.key]}
                            onValueChange={(value) => {
                              if (value) updateTierModel(toolTiers.tool, tier.key, value);
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue>
                                {getModelLabel(toolTiers[tier.key])}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {options.map((model) => (
                                <SelectItem key={model.value} value={model.value}>
                                  {model.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Changes apply to future Auto routing decisions.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={
                    saving ||
                    (prompt === settings.defaultPrompt &&
                      serializeTiers(modelTiers) === serializeTiers(settings.defaultModelTiers))
                  }
                  onClick={() => {
                    setPrompt(settings.defaultPrompt);
                    setModelTiers(settings.defaultModelTiers);
                  }}
                >
                  Reset to default
                </Button>
                <Button
                  type="button"
                  disabled={saving || !hasChanges}
                  onClick={() => void saveSettings(prompt, modelTiers)}
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No active organization selected.</p>
        )}
      </div>
    </div>
  );
}
