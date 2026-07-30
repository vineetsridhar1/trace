import { SettingsShell } from "../components/settings/SettingsShell";
import { ControlButton, Panel, StatusPill } from "../components/settings/bits";
import { Icon } from "../components/settings/icons";

const SOURCE = "src/design/screens/SettingsRepositories.tsx";

function RepoHeader({
  idPrefix,
  name,
  remote,
  branch,
  pill,
}: {
  idPrefix: string;
  name: string;
  remote: string;
  branch: string;
  pill: React.ReactNode;
}) {
  return (
    <div
      data-trace-id={`${idPrefix}-header`}
      data-trace-source={SOURCE}
      className="flex items-center gap-3 px-4 py-3.5"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-design-control border border-design-border bg-design-background text-design-muted">
        <Icon name="gitBranch" size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13px] font-semibold text-design-foreground">{name}</p>
          {pill}
        </div>
        <p className="mt-0.5 truncate text-xs text-design-muted">{remote}</p>
      </div>
      <div
        data-trace-id={`${idPrefix}-branch`}
        data-trace-source={SOURCE}
        className="flex shrink-0 items-center gap-1.5 text-xs text-design-muted"
      >
        Default branch
        <span className="rounded-md border border-design-border bg-design-background px-1.5 py-0.5 font-design-mono text-[11px] text-design-foreground">
          {branch}
        </span>
        <ControlButton
          traceId={`${idPrefix}-branch-edit`}
          variant="ghost"
          size="icon"
          icon="pencil"
          aria-label={`Edit default branch of ${name}`}
        />
      </div>
    </div>
  );
}

export default function SettingsRepositories() {
  return (
    <SettingsShell
      screen="repos"
      active="repositories"
      title="Repositories"
      description="Codebases linked to Nighthawk Labs. Each repository carries its own automation: a setup script and named run scripts for sessions."
      width="wide"
      action={
        <ControlButton traceId="repos-connect-cta" variant="primary" icon="plus">
          Connect repository
        </ControlButton>
      }
    >
      {/* Desktop-only GitHub CLI status, flattened to one quiet row */}
      <div
        data-trace-id="repos-gh-cli"
        data-trace-source={SOURCE}
        className="mb-5 flex items-center gap-2.5 rounded-design-control border border-design-border bg-design-surface/50 px-4 py-2.5"
      >
        <Icon name="terminal" size={14} className="shrink-0 text-design-secondary" />
        <p className="min-w-0 flex-1 truncate text-xs text-design-muted">
          Local sessions poll pull-request status through the desktop app using the GitHub CLI.
        </p>
        <StatusPill tone="success" label="GitHub CLI connected" traceId="repos-gh-cli-pill" />
      </div>

      <div className="space-y-3">
        {/* Expanded repo with automation (absorbs the old Channels tab) */}
        <Panel traceId="repos-trace" className="overflow-hidden">
          <RepoHeader
            idPrefix="repos-trace"
            name="trace"
            remote="github.com/vineetsridhar1/trace"
            branch="main"
            pill={<StatusPill tone="success" label="Webhook connected" traceId="repos-trace-webhook" />}
          />
          <div
            data-trace-id="repos-trace-automation"
            data-trace-source={SOURCE}
            className="border-t border-design-border bg-design-background/30 px-4 py-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-design-secondary">
                  Session automation
                </p>
                <p className="mt-1 text-xs leading-4 text-design-muted">
                  The setup script runs once when a session workspace starts; terminals wait until it
                  completes. Run scripts open as named terminals from the Run button.
                </p>
              </div>
              <ControlButton traceId="repos-trace-automation-edit" size="sm">
                Edit automation
              </ControlButton>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_1fr] gap-3">
              <div data-trace-id="repos-trace-setup" data-trace-source={SOURCE}>
                <p className="mb-1.5 text-xs font-medium text-design-muted">Setup script</p>
                <pre className="overflow-x-auto rounded-design-control border border-design-border bg-design-background px-3 py-2.5 font-design-mono text-xs leading-5 text-design-foreground">
                  pnpm install && pnpm gql:codegen
                </pre>
              </div>
              <div data-trace-id="repos-trace-run-scripts" data-trace-source={SOURCE}>
                <p className="mb-1.5 text-xs font-medium text-design-muted">Run scripts · 2 of 10</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 rounded-design-control border border-design-border bg-design-background px-3 py-1.5">
                    <span className="w-24 shrink-0 text-xs font-medium text-design-foreground">
                      Dev server
                    </span>
                    <code className="truncate font-design-mono text-[11px] text-design-muted">pnpm dev</code>
                  </div>
                  <div className="flex items-center gap-2 rounded-design-control border border-design-border bg-design-background px-3 py-1.5">
                    <span className="w-24 shrink-0 text-xs font-medium text-design-foreground">Tests</span>
                    <code className="truncate font-design-mono text-[11px] text-design-muted">pnpm test</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Panel>

        {/* Webhook not connected */}
        <Panel traceId="repos-console" className="overflow-hidden">
          <RepoHeader
            idPrefix="repos-console"
            name="nighthawk-console"
            remote="github.com/nighthawk-labs/console"
            branch="main"
            pill={<StatusPill tone="muted" label="Webhook off" traceId="repos-console-webhook" />}
          />
          <div
            data-trace-id="repos-console-webhook-row"
            data-trace-source={SOURCE}
            className="flex items-center justify-between gap-4 border-t border-design-border px-4 py-2.5"
          >
            <p className="text-xs text-design-muted">
              Connect the webhook to sync pull-request status and trigger sessions from GitHub events.
            </p>
            <ControlButton traceId="repos-console-webhook-connect" size="sm">
              Connect webhook
            </ControlButton>
          </div>
        </Panel>

        {/* Local-only repo */}
        <Panel traceId="repos-docs" className="overflow-hidden">
          <RepoHeader
            idPrefix="repos-docs"
            name="design-notes"
            remote="Local project — no remote configured"
            branch="main"
            pill={<StatusPill tone="muted" label="Local only" traceId="repos-docs-pill" />}
          />
        </Panel>
      </div>

      <p
        data-trace-id="repos-footnote"
        data-trace-source={SOURCE}
        className="mt-4 flex items-center gap-1.5 text-xs text-design-muted"
      >
        <Icon name="info" size={13} className="shrink-0" />
        Automation moved here from the old Channels tab — scripts belong to the repository they run
        in, and every coding channel on a repo shares them.
      </p>
    </SettingsShell>
  );
}
