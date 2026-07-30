import { SettingsShell } from "../components/settings/SettingsShell";
import { ControlButton, Panel, StatusPill } from "../components/settings/bits";
import { Icon } from "../components/settings/icons";

const SOURCE = "src/design/screens/SettingsSecrets.tsx";

const SECRETS = [
  { name: "GITHUB_TOKEN", updated: "Jul 12, 2026", note: "Shared GitHub access for files and diffs" },
  { name: "ANTHROPIC_API_KEY", updated: "Jun 30, 2026", note: "Injected into cloud session runtimes" },
  { name: "FLY_LAUNCHER_TOKEN", updated: "Jun 30, 2026", note: "Authenticates the cloud launcher" },
];

export default function SettingsSecrets() {
  return (
    <SettingsShell
      screen="secrets"
      active="secrets"
      title="Secrets"
      description="Encrypted workspace-wide values for the cloud launcher, session runtimes, and shared server actions. Values are write-only — they can be replaced but never read back."
      width="wide"
      action={
        <ControlButton traceId="secrets-import-cta" icon="terminal">
          Import from .env
        </ControlButton>
      }
    >
      {/* Add secret */}
      <Panel traceId="secrets-add-panel" className="mb-6 p-4">
        <p
          data-trace-id="secrets-add-title"
          data-trace-source={SOURCE}
          className="mb-3 text-[13px] font-medium text-design-foreground"
        >
          Add a secret
        </p>
        <div className="flex items-center gap-2">
          <label className="w-64 shrink-0" data-trace-id="secrets-add-name" data-trace-source={SOURCE}>
            <input
              type="text"
              aria-label="Secret name"
              placeholder="NAME_IN_SCREAMING_SNAKE"
              className="h-9 w-full rounded-design-control border border-design-border bg-design-background px-3 font-design-mono text-xs text-design-foreground outline-none transition-colors placeholder:text-design-muted focus:border-design-primary"
            />
          </label>
          <label className="min-w-0 flex-1" data-trace-id="secrets-add-value" data-trace-source={SOURCE}>
            <input
              type="password"
              aria-label="Secret value"
              placeholder="Value"
              className="h-9 w-full rounded-design-control border border-design-border bg-design-background px-3 text-[13px] text-design-foreground outline-none transition-colors placeholder:text-design-muted focus:border-design-primary"
            />
          </label>
          <ControlButton traceId="secrets-add-save" variant="primary">
            Save secret
          </ControlButton>
        </div>
      </Panel>

      {/* Secrets table */}
      <Panel traceId="secrets-table" className="overflow-hidden">
        <div
          data-trace-id="secrets-table-head"
          data-trace-source={SOURCE}
          className="grid grid-cols-[220px_minmax(0,1fr)_130px_40px] items-center gap-4 border-b border-design-border bg-design-background/40 px-4 py-2.5"
        >
          {["Name", "Used for", "Updated", ""].map((label, index) => (
            <span
              key={index}
              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-design-secondary"
            >
              {label}
            </span>
          ))}
        </div>
        {SECRETS.map((secret, index) => (
          <div
            key={secret.name}
            data-trace-id={`secrets-row-${index}`}
            data-trace-source={SOURCE}
            className="grid grid-cols-[220px_minmax(0,1fr)_130px_40px] items-center gap-4 border-b border-design-border px-4 py-3 last:border-b-0 hover:bg-design-background/40"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Icon name="shield" size={13} className="shrink-0 text-design-secondary" />
              <code className="truncate font-design-mono text-xs text-design-foreground">
                {secret.name}
              </code>
            </div>
            <p className="truncate text-[13px] text-design-muted">{secret.note}</p>
            <span className="text-[13px] text-design-muted">{secret.updated}</span>
            <div className="flex justify-end">
              <ControlButton
                traceId={`secrets-delete-${index}`}
                variant="ghost"
                size="icon"
                icon="trash"
                aria-label={`Delete ${secret.name}`}
                className="hover:text-design-danger"
              />
            </div>
          </div>
        ))}
      </Panel>

      {/* GITHUB_TOKEN guidance kept from the original section, promoted to a visible tip */}
      <div
        data-trace-id="secrets-github-tip"
        data-trace-source={SOURCE}
        className="mt-5 flex items-start justify-between gap-4 rounded-design-control border border-design-border bg-design-surface/50 px-4 py-3"
      >
        <div className="flex items-start gap-2.5">
          <Icon name="check" size={14} className="mt-0.5 shrink-0 text-design-success" />
          <p className="text-xs leading-5 text-design-muted">
            <code className="font-design-mono text-design-foreground">GITHUB_TOKEN</code> is set, so
            members can browse GitHub files and diffs without adding personal tokens.
          </p>
        </div>
        <StatusPill tone="success" label="Recommended setup complete" traceId="secrets-github-pill" />
      </div>
    </SettingsShell>
  );
}
