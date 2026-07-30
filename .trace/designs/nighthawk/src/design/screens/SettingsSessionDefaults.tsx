import { SettingsShell } from "../components/settings/SettingsShell";
import { Panel, SelectMenu, ToggleRow } from "../components/settings/bits";
import { Icon } from "../components/settings/icons";

const SOURCE = "src/design/screens/SettingsSessionDefaults.tsx";

export default function SettingsSessionDefaults() {
  return (
    <SettingsShell
      screen="session-defaults"
      active="session-defaults"
      title="Session defaults"
      description="Your personal defaults for new coding sessions. You can still change tool, model, and effort when starting any session."
    >
      {/* Tool / model / effort */}
      <Panel traceId="defaults-new-session" className="p-5">
        <p
          data-trace-id="defaults-new-session-title"
          data-trace-source={SOURCE}
          className="text-[13px] font-semibold text-design-foreground"
        >
          New sessions start with
        </p>
        <div
          data-trace-id="defaults-selects"
          data-trace-source={SOURCE}
          className="mt-4 grid grid-cols-3 gap-3"
        >
          <SelectMenu
            traceId="defaults-tool"
            label="Coding tool"
            options={["Claude Code", "Codex", "Pi", "Antigravity"]}
            initial="Claude Code"
          />
          <SelectMenu
            traceId="defaults-model"
            label="Model"
            options={["Fable 5", "Sonnet 5", "Sonnet 4.6", "Opus 4.8", "Opus 4.8 (1M)", "Haiku 4.5"]}
            initial="Fable 5"
          />
          <SelectMenu
            traceId="defaults-effort"
            label="Reasoning effort"
            options={["Low", "Medium", "High", "Extra high", "Max"]}
            initial="High"
          />
        </div>
        <p
          data-trace-id="defaults-selects-hint"
          data-trace-source={SOURCE}
          className="mt-3 flex items-center gap-1.5 text-xs leading-4 text-design-muted"
        >
          <Icon name="info" size={13} />
          Model and effort options follow the selected tool. Changing the tool resets both to that
          tool's defaults.
        </p>
      </Panel>

      {/* Behavior toggles — previously Yes/No dropdowns */}
      <Panel traceId="defaults-behavior" className="mt-4 px-5 py-1">
        <div className="divide-y divide-design-border">
          <ToggleRow
            traceId="defaults-auto-archive"
            label="Auto-archive merged sessions"
            description="When a session's pull request merges, move the session to the archive automatically."
            defaultOn
          />
          <ToggleRow
            traceId="defaults-claude-chrome"
            label="Claude in Chrome"
            description="Let Claude Code drive a Chrome browser inside cloud sessions for web tasks and UI verification."
          />
        </div>
      </Panel>

      {/* Scope note */}
      <div
        data-trace-id="defaults-scope-note"
        data-trace-source={SOURCE}
        className="mt-4 flex items-start gap-2.5 rounded-design-control border border-design-border bg-design-surface/50 px-4 py-3"
      >
        <Icon name="sliders" size={14} className="mt-0.5 shrink-0 text-design-secondary" />
        <p className="text-xs leading-5 text-design-muted">
          These defaults apply only to you. Workspace-level runtime configuration lives under{" "}
          <span className="text-design-foreground">Agent environments</span>, and shared credentials
          under <span className="text-design-foreground">Secrets</span>.
        </p>
      </div>
    </SettingsShell>
  );
}
