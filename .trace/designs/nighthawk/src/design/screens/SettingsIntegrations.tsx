import { SettingsShell } from "../components/settings/SettingsShell";
import { ControlButton, Panel, StatusPill } from "../components/settings/bits";
import { Icon } from "../components/settings/icons";

const SOURCE = "src/design/screens/SettingsIntegrations.tsx";

const BINDINGS = [
  { slack: "#eng-backend", trace: "backend" },
  { slack: "#eng-web", trace: "web" },
];

const NEXT_STEPS = [
  { step: "Invite Trace", detail: "/invite @Trace in the Slack channel" },
  { step: "Bind the channel", detail: "/trace bind links it to a Trace channel" },
  { step: "Start sessions", detail: "@trace with a prompt starts a coding session" },
];

export default function SettingsIntegrations() {
  return (
    <SettingsShell
      screen="integrations"
      active="integrations"
      title="Integrations"
      description="Connect outside tools to Nighthawk Labs. Members keep working where conversations already happen."
    >
      <Panel traceId="integrations-slack" className="overflow-hidden">
        {/* Slack header */}
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-design-control border border-design-border bg-design-background text-design-muted">
            <Icon name="hash" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-design-foreground">Slack</p>
              <StatusPill tone="success" label="Installed" traceId="integrations-slack-pill" />
            </div>
            <p className="mt-0.5 text-xs text-design-muted">
              Connected to the Nighthawk Labs Slack workspace since Jun 18, 2026.
            </p>
          </div>
          <ControlButton
            traceId="integrations-slack-disconnect"
            variant="danger"
            size="sm"
            icon="x"
          >
            Disconnect
          </ControlButton>
        </div>

        {/* Channel bindings */}
        <div
          data-trace-id="integrations-bindings"
          data-trace-source={SOURCE}
          className="border-t border-design-border px-4 py-4"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-design-secondary">
            Channel bindings
          </p>
          <div className="space-y-1.5">
            {BINDINGS.map((binding, index) => (
              <div
                key={binding.slack}
                data-trace-id={`integrations-binding-${index}`}
                data-trace-source={SOURCE}
                className="flex items-center gap-3 rounded-design-control border border-design-border bg-design-background px-3 py-2"
              >
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-design-muted">
                  <Icon name="hash" size={13} className="shrink-0" />
                  <span className="truncate">{binding.slack}</span>
                </span>
                <Icon name="chevronRight" size={13} className="shrink-0 text-design-secondary" />
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-medium text-design-foreground">
                  <Icon name="terminal" size={13} className="shrink-0 text-design-muted" />
                  <span className="truncate">{binding.trace}</span>
                </span>
                <ControlButton
                  traceId={`integrations-binding-remove-${index}`}
                  variant="ghost"
                  size="icon"
                  icon="x"
                  aria-label={`Unbind ${binding.slack}`}
                  className="hover:text-design-danger"
                />
              </div>
            ))}
          </div>
        </div>

        {/* How binding works */}
        <div
          data-trace-id="integrations-steps"
          data-trace-source={SOURCE}
          className="grid grid-cols-3 gap-4 border-t border-design-border bg-design-background/30 px-4 py-4"
        >
          {NEXT_STEPS.map((item, index) => (
            <div key={item.step} data-trace-id={`integrations-step-${index}`} data-trace-source={SOURCE}>
              <p className="text-xs font-medium text-design-foreground">
                {index + 1}. {item.step}
              </p>
              <p className="mt-1 font-design-mono text-[11px] leading-4 text-design-muted">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      {/* GitHub — surfaced here as a pointer, configured per-repo */}
      <Panel traceId="integrations-github" className="mt-4">
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-design-control border border-design-border bg-design-background text-design-muted">
            <Icon name="gitBranch" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-design-foreground">GitHub webhooks</p>
              <StatusPill tone="success" label="1 of 2 repos connected" traceId="integrations-github-pill" />
            </div>
            <p className="mt-0.5 text-xs text-design-muted">
              Webhooks sync pull-request status per repository. Manage them under Repositories.
            </p>
          </div>
          <ControlButton traceId="integrations-github-manage" size="sm" icon="chevronRight">
            Manage in Repositories
          </ControlButton>
        </div>
      </Panel>
    </SettingsShell>
  );
}
