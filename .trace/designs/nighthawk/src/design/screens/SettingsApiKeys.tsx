import { useState } from "react";
import { SettingsShell } from "../components/settings/SettingsShell";
import { ControlButton, Panel, StatusPill } from "../components/settings/bits";
import { Icon, type IconName } from "../components/settings/icons";

const SOURCE = "src/design/screens/SettingsApiKeys.tsx";

function KeyRow({
  idPrefix,
  icon,
  label,
  description,
  right,
  children,
}: {
  idPrefix: string;
  icon: IconName;
  label: string;
  description: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Panel traceId={idPrefix} className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-design-control border border-design-border bg-design-background text-design-muted">
          <Icon name={icon} size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-design-foreground">{label}</p>
          <p className="mt-0.5 text-xs text-design-muted">{description}</p>
        </div>
        {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
      </div>
      {children}
    </Panel>
  );
}

export default function SettingsApiKeys() {
  const [revealed, setRevealed] = useState(false);
  return (
    <SettingsShell
      screen="api-keys"
      active="api-keys"
      title="API keys"
      description="Your personal credentials. They are encrypted at rest and used only for sessions and integrations you start — never shared with other members."
    >
      <div className="space-y-3">
        {/* Anthropic — shown in editing state */}
        <KeyRow
          idPrefix="apikeys-anthropic"
          icon="key"
          label="Anthropic"
          description="Runs Claude Code sessions with your personal Anthropic account."
          right={<StatusPill tone="success" label="Configured" traceId="apikeys-anthropic-pill" />}
        >
          <div
            data-trace-id="apikeys-anthropic-edit"
            data-trace-source={SOURCE}
            className="border-t border-design-border bg-design-background/30 px-4 py-3.5"
          >
            <p className="mb-2 text-xs font-medium text-design-muted">
              Replace key — saving overwrites the current one
            </p>
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  type={revealed ? "text" : "password"}
                  defaultValue="sk-ant-api03-J2mJq8xw"
                  aria-label="Anthropic API key"
                  data-trace-id="apikeys-anthropic-input"
                  data-trace-source={SOURCE}
                  className="h-9 w-full rounded-design-control border border-design-primary bg-design-background px-3 pr-9 font-design-mono text-xs text-design-foreground outline-none ring-2 ring-design-primary/25"
                />
                <button
                  type="button"
                  onClick={() => setRevealed((v) => !v)}
                  aria-label={revealed ? "Hide key" : "Show key"}
                  data-trace-id="apikeys-anthropic-reveal"
                  data-trace-source={SOURCE}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-design-muted transition-colors hover:text-design-foreground"
                >
                  <Icon name="eye" size={15} />
                </button>
              </div>
              <ControlButton traceId="apikeys-anthropic-save" variant="primary" size="md">
                Save key
              </ControlButton>
              <ControlButton traceId="apikeys-anthropic-cancel" variant="ghost" size="md">
                Cancel
              </ControlButton>
            </div>
          </div>
        </KeyRow>

        {/* GitHub */}
        <KeyRow
          idPrefix="apikeys-github"
          icon="gitBranch"
          label="GitHub"
          description="Cloud containers, repository files, diffs, and webhooks. Updated Jun 30, 2026."
          right={
            <>
              <StatusPill tone="success" label="Configured" traceId="apikeys-github-pill" />
              <ControlButton traceId="apikeys-github-import" size="sm" icon="terminal">
                Import from CLI
              </ControlButton>
              <ControlButton traceId="apikeys-github-replace" size="sm">
                Replace
              </ControlButton>
              <ControlButton
                traceId="apikeys-github-remove"
                variant="ghost"
                size="icon"
                icon="trash"
                aria-label="Remove GitHub token"
                className="hover:text-design-danger"
              />
            </>
          }
        />

        {/* SSH key */}
        <KeyRow
          idPrefix="apikeys-ssh"
          icon="shield"
          label="SSH private key"
          description="Lets cloud sessions clone private repositories over SSH."
          right={
            <>
              <StatusPill tone="muted" label="Not set" traceId="apikeys-ssh-pill" />
              <ControlButton traceId="apikeys-ssh-add" size="sm" icon="plus">
                Add key
              </ControlButton>
            </>
          }
        />

        {/* Codex */}
        <KeyRow
          idPrefix="apikeys-codex"
          icon="terminal"
          label="Codex"
          description="Authenticated via ChatGPT. Also accepts a Codex access token or an OpenAI API key."
          right={
            <>
              <StatusPill tone="success" label="Authenticated" traceId="apikeys-codex-pill" />
              <ControlButton traceId="apikeys-codex-reauth" size="sm">
                Reauthenticate
              </ControlButton>
              <ControlButton
                traceId="apikeys-codex-remove"
                variant="ghost"
                size="icon"
                icon="trash"
                aria-label="Remove Codex credential"
                className="hover:text-design-danger"
              />
            </>
          }
        />
      </div>

      <div
        data-trace-id="apikeys-org-note"
        data-trace-source={SOURCE}
        className="mt-5 flex items-start gap-2.5 rounded-design-control border border-design-border bg-design-surface/50 px-4 py-3"
      >
        <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-design-secondary" />
        <p className="text-xs leading-5 text-design-muted">
          Setting up keys for the whole team? Workspace-wide credentials such as a shared{" "}
          <span className="font-design-mono text-design-foreground">GITHUB_TOKEN</span> live under{" "}
          <span className="text-design-foreground">Workspace → Secrets</span>, so members can view
          files and diffs without personal setup.
        </p>
      </div>
    </SettingsShell>
  );
}
