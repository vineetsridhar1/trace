import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@trace/client-core";
import { CheckCircle2, CircleAlert, ExternalLink, Hash, MessageSquare } from "lucide-react";
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
    <section className="space-y-3">
      <div className="overflow-hidden rounded-md border border-border bg-surface-elevated">
        {loading && !settings ? (
          <div className="p-4 text-sm text-muted-foreground">Loading...</div>
        ) : !settings?.configured ? (
          <div className="flex items-start gap-3 p-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background/50">
              <CircleAlert size={17} className="text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">Slack</h2>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  Not configured
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Slack is disabled until the server has Slack credentials configured.
              </p>
              {settings?.missingConfig.length ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Missing: {settings.missingConfig.join(", ")}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="flex min-w-0 gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background/50">
                  <MessageSquare size={17} className="text-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Slack</h2>
                    {settings.install ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-2 py-0.5 text-xs text-foreground">
                        <CheckCircle2 size={12} />
                        Installed
                      </span>
                    ) : (
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        Ready to install
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {settings.install
                      ? `Connected to ${settings.install.slackTeamName ?? settings.install.slackTeamId}.`
                      : "Connect Slack to start Trace sessions from bound Slack channels."}
                  </p>
                </div>
              </div>

              {!settings.install && installUrl ? (
                <Button size="sm" onClick={openInstallUrl}>
                  <ExternalLink size={14} />
                  Install
                </Button>
              ) : null}
            </div>

            {settings.install ? (
              <div className="border-t border-border px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Next steps</p>
                <div className="mt-2 grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
                  <div>
                    <span className="font-medium text-foreground">1. Invite Trace</span>
                    <p>Run <code className="text-foreground">/invite @Trace</code> in Slack.</p>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">2. Bind channel</span>
                    <p>Run <code className="text-foreground">/trace bind</code> in that channel.</p>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">3. Start sessions</span>
                    <p>Mention <code className="text-foreground">@trace</code> with a prompt.</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="border-t border-border px-4 py-3">
              {settings.bindings.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Channel bindings</p>
                  {settings.bindings.map((binding) => (
                    <div
                      key={binding.id}
                      className="flex items-center justify-between gap-3 rounded-md bg-background/40 px-3 py-2 text-sm"
                    >
                      <span className="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
                        <Hash size={14} />
                        <span className="truncate">{binding.slackChannelId}</span>
                      </span>
                      <span className="truncate text-foreground">{binding.traceChannel.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No Slack channels are bound yet.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
