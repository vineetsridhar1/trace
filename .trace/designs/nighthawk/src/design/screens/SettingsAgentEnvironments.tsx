import { SettingsShell } from "../components/settings/SettingsShell";
import { ControlButton, Panel, StatusPill } from "../components/settings/bits";
import { Icon } from "../components/settings/icons";

const SOURCE = "src/design/screens/SettingsAgentEnvironments.tsx";

export default function SettingsAgentEnvironments() {
  return (
    <SettingsShell
      screen="agent-env"
      active="agent-environments"
      title="Agent environments"
      description="Where agent sessions run for this workspace: members' local bridges, plus one cloud launcher that provisions managed runtimes on demand."
      width="wide"
    >
      {/* Local bridges — read-only inventory */}
      <section data-trace-id="agentenv-local" data-trace-source={SOURCE} className="mb-8">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-design-foreground">Local bridges</h2>
            <p className="mt-0.5 text-xs text-design-muted">
              Desktop apps connected under members' accounts. Manage sharing under Devices &amp; access.
            </p>
          </div>
        </div>
        <Panel traceId="agentenv-local-list" className="overflow-hidden">
          <div
            data-trace-id="agentenv-local-row-1"
            data-trace-source={SOURCE}
            className="flex items-center gap-3 border-b border-design-border px-4 py-3"
          >
            <Icon name="laptop" size={15} className="shrink-0 text-design-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-design-foreground">Vineet's MacBook Pro</p>
              <p className="text-xs text-design-muted">vineet@nighthawk.dev · last seen just now</p>
            </div>
            <StatusPill tone="success" label="Connected" traceId="agentenv-local-pill-1" />
          </div>
          <div
            data-trace-id="agentenv-local-row-2"
            data-trace-source={SOURCE}
            className="flex items-center gap-3 px-4 py-3"
          >
            <Icon name="laptop" size={15} className="shrink-0 text-design-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-design-foreground">Studio Mac mini</p>
              <p className="text-xs text-design-muted">maya@nighthawk.dev · last seen Jul 28, 9:14 PM</p>
            </div>
            <StatusPill tone="muted" label="Offline" traceId="agentenv-local-pill-2" />
          </div>
        </Panel>
      </section>

      {/* Cloud environment */}
      <section data-trace-id="agentenv-cloud" data-trace-source={SOURCE}>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-design-foreground">Cloud environment</h2>
            <p className="mt-0.5 text-xs text-design-muted">
              One cloud environment per workspace. Trace calls your launcher to start a runtime,
              waits for it to connect, and stops it when the session ends.
            </p>
          </div>
          <ControlButton traceId="agentenv-refresh" size="sm" icon="refresh">
            Refresh
          </ControlButton>
        </div>

        <Panel traceId="agentenv-cloud-card" className="overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-design-control border border-design-border bg-design-background text-design-muted">
              <Icon name="cloud" size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-semibold text-design-foreground">Fly.io launcher</p>
                <StatusPill tone="success" label="Enabled" traceId="agentenv-cloud-enabled" />
                <span className="rounded-full border border-design-border px-2 py-0.5 text-[11px] font-medium text-design-muted">
                  Default
                </span>
              </div>
              <p className="mt-0.5 truncate font-design-mono text-[11px] text-design-muted">
                launcher.nighthawk.dev · startup timeout 180s · deprovision on session end
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ControlButton traceId="agentenv-cloud-test" size="sm" icon="zap">
                Test connection
              </ControlButton>
              <ControlButton traceId="agentenv-cloud-edit" size="sm">
                Edit
              </ControlButton>
              <ControlButton
                traceId="agentenv-cloud-delete"
                variant="ghost"
                size="icon"
                icon="trash"
                aria-label="Delete cloud environment"
                className="hover:text-design-danger"
              />
            </div>
          </div>

          {/* Last test result — visible, timestamped, not just toast */}
          <div
            data-trace-id="agentenv-cloud-testresult"
            data-trace-source={SOURCE}
            className="flex items-center gap-2 border-t border-design-border bg-design-background/30 px-4 py-2.5"
          >
            <Icon name="check" size={13} className="shrink-0 text-design-success" />
            <p className="text-xs text-design-muted">
              <span className="font-medium text-design-success">Connection test passed</span> · today
              at 2:41 PM · start, stop, and status endpoints responded
            </p>
          </div>

          {/* Endpoints + runtime env */}
          <div
            data-trace-id="agentenv-cloud-detail"
            data-trace-source={SOURCE}
            className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-design-border px-4 py-4"
          >
            <div data-trace-id="agentenv-endpoints" data-trace-source={SOURCE}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-design-secondary">
                Launcher endpoints
              </p>
              <div className="space-y-1.5 text-xs">
                {[
                  ["Start", "POST /v1/runtimes/start"],
                  ["Stop", "POST /v1/runtimes/stop"],
                  ["Status", "GET /v1/runtimes/status"],
                ].map(([label, path]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-design-muted">{label}</span>
                    <code className="truncate rounded-md border border-design-border bg-design-background px-1.5 py-0.5 font-design-mono text-[11px] text-design-foreground">
                      {path}
                    </code>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <span className="w-12 shrink-0 text-design-muted">Auth</span>
                  <span className="text-design-foreground">
                    Bearer token from secret{" "}
                    <code className="font-design-mono text-[11px]">FLY_LAUNCHER_TOKEN</code>
                  </span>
                </div>
              </div>
            </div>
            <div data-trace-id="agentenv-runtime-env" data-trace-source={SOURCE}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-design-secondary">
                Runtime environment variables
              </p>
              <div className="space-y-1.5">
                {[
                  ["GITHUB_TOKEN", "GITHUB_TOKEN"],
                  ["ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"],
                ].map(([name, secret]) => (
                  <div
                    key={name}
                    className="flex items-center gap-2 rounded-design-control border border-design-border bg-design-background px-2.5 py-1.5"
                  >
                    <code className="min-w-0 flex-1 truncate font-design-mono text-[11px] text-design-foreground">
                      {name}
                    </code>
                    <Icon name="chevronRight" size={12} className="shrink-0 text-design-secondary" />
                    <span className="flex items-center gap-1 text-[11px] text-design-muted">
                      <Icon name="shield" size={11} />
                      {secret}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-4 text-design-muted">
                Values come from workspace Secrets and are injected when a runtime starts.
              </p>
            </div>
          </div>
        </Panel>

        <p
          data-trace-id="agentenv-single-note"
          data-trace-source={SOURCE}
          className="mt-3 flex items-center gap-1.5 text-xs text-design-muted"
        >
          <Icon name="info" size={13} className="shrink-0" />
          To switch launchers, disable this environment first — only one cloud environment can be
          enabled at a time.
        </p>
      </section>
    </SettingsShell>
  );
}
