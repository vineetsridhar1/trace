import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@trace/client-core";
import { ExternalLink } from "lucide-react";
import { Button } from "../ui/button";

type SlackSettings = {
  configured: boolean;
  missingConfig: string[];
  canInstall: boolean;
  install: { slackTeamId: string; slackTeamName: string | null; createdAt: string } | null;
  bindings: {
    id: string;
    slackTeamId: string;
    slackChannelId: string;
    traceChannel: { id: string; name: string };
    createdAt: string;
  }[];
};

export function IntegrationsSection() {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const [settings, setSettings] = useState<SlackSettings | null>(null);
  const [loading, setLoading] = useState(false);

  const installPath = useMemo(
    () => (activeOrgId ? `/slack/install?org=${encodeURIComponent(activeOrgId)}` : null),
    [activeOrgId],
  );
  const installUrl = useMemo(() => {
    if (!installPath) return null;
    return `${window.location.origin}${installPath}`;
  }, [installPath]);

  const fetchSettings = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    try {
      const response = await fetch(`/slack/settings?org=${encodeURIComponent(activeOrgId)}`, {
        credentials: "include",
      });
      if (response.ok) {
        setSettings((await response.json()) as SlackSettings);
      }
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const openInstallUrl = useCallback(() => {
    if (!installUrl) return;
    window.open(installUrl, "_blank", "noopener,noreferrer");
  }, [installUrl]);

  if (!activeOrgId) {
    return <p className="text-sm text-muted-foreground">Select an organization first.</p>;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Slack</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect a Slack workspace, link Slack users to Trace users, and bind Slack channels to
          Trace channels.
        </p>
      </div>

      <div className="rounded-md border border-border bg-surface-elevated p-4">
        {loading && !settings ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !settings?.configured ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Not configured</p>
            <p className="text-sm text-muted-foreground">
              Slack is disabled until the server has Slack credentials configured.
            </p>
            {settings?.missingConfig.length ? (
              <p className="text-xs text-muted-foreground">
                Missing: {settings.missingConfig.join(", ")}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {settings.install
                    ? `Installed in ${settings.install.slackTeamName ?? settings.install.slackTeamId}`
                    : "Configured, not installed"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {settings.install
                    ? "Add Trace to Slack channels and bind each one to a Trace channel."
                    : "Install Slack for this Trace organization."}
                </p>
              </div>
              {installUrl ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openInstallUrl}
                >
                  <ExternalLink size={14} />
                  Install
                </Button>
              ) : null}
            </div>

            {settings.bindings.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Channel bindings
                </p>
                {settings.bindings.map((binding) => (
                  <div
                    key={binding.id}
                    className="flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">{binding.slackChannelId}</span>
                    <span className="text-foreground">{binding.traceChannel.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No Slack channels are bound yet. Use `/trace bind` in Slack after inviting Trace to
                a channel.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
