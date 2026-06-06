import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { useAuthStore } from "@trace/client-core";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

const MODEL_ROUTER_SETTINGS_QUERY = gql`
  query ModelRouterSettings($organizationId: ID!) {
    modelRouterSettings(organizationId: $organizationId) {
      enabled
      prompt
      defaultPrompt
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
      cacheTtlSeconds
    }
  }
`;

type RouterSettings = {
  enabled: boolean;
  prompt: string;
  defaultPrompt: string;
  cacheTtlSeconds: number;
};

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!activeOrgId || !isAdmin) {
      setSettings(null);
      setPrompt("");
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

  const hasChanges = settings ? prompt.trim() !== settings.prompt : false;

  const savePrompt = async (nextPrompt: string) => {
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
          input: { organizationId: activeOrgId, prompt: trimmedPrompt },
        })
        .toPromise();
      if (result.error) throw result.error;
      const nextSettings = result.data?.updateModelRouterSettings as RouterSettings | undefined;
      if (nextSettings) {
        setSettings(nextSettings);
        setPrompt(nextSettings.prompt);
      }
      toast.success("Model router prompt updated");
    } catch (error) {
      toast.error("Failed to update model router prompt", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
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
          Customize the prompt Auto uses before choosing a model for new sessions.
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

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Changes apply to future Auto routing decisions.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving || prompt === settings.defaultPrompt}
                  onClick={() => setPrompt(settings.defaultPrompt)}
                >
                  Reset to default
                </Button>
                <Button
                  type="button"
                  disabled={saving || !hasChanges}
                  onClick={() => void savePrompt(prompt)}
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
