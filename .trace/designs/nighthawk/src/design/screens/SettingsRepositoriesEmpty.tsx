import { SettingsShell } from "../components/settings/SettingsShell";
import { ControlButton, EmptyState, Panel } from "../components/settings/bits";
import { Icon } from "../components/settings/icons";

const SOURCE = "src/design/screens/SettingsRepositoriesEmpty.tsx";

const STEPS = [
  {
    title: "Connect a repository",
    body: "Paste a GitHub URL, or add a local project from the desktop app.",
  },
  {
    title: "Set the default branch",
    body: "Sessions branch from it and open pull requests against it.",
  },
  {
    title: "Add automation",
    body: "A setup script plus run scripts make every session ready to work.",
  },
];

export default function SettingsRepositoriesEmpty() {
  return (
    <SettingsShell
      screen="repos-empty"
      active="repositories"
      title="Repositories"
      description="Codebases linked to Nighthawk Labs. Each repository carries its own automation: a setup script and named run scripts for sessions."
      width="wide"
    >
      <EmptyState
        traceId="repos-empty-state"
        icon="gitBranch"
        title="No repositories yet"
        description="Connect the codebase your team works in. Agents and members start every coding session from a repository."
      >
        <ControlButton traceId="repos-empty-connect" variant="primary" icon="plus">
          Connect repository
        </ControlButton>
        <ControlButton traceId="repos-empty-local">Add local project</ControlButton>
      </EmptyState>

      <div
        data-trace-id="repos-empty-steps"
        data-trace-source={SOURCE}
        className="mt-6 grid grid-cols-3 gap-3"
      >
        {STEPS.map((step, index) => (
          <Panel key={step.title} traceId={`repos-empty-step-${index}`} className="p-4">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-design-border bg-design-background text-[11px] font-semibold text-design-muted">
              {index + 1}
            </span>
            <p className="mt-3 text-[13px] font-medium text-design-foreground">{step.title}</p>
            <p className="mt-1 text-xs leading-5 text-design-muted">{step.body}</p>
          </Panel>
        ))}
      </div>

      <p
        data-trace-id="repos-empty-hint"
        data-trace-source={SOURCE}
        className="mt-5 flex items-center gap-1.5 text-xs text-design-muted"
      >
        <Icon name="info" size={13} className="shrink-0" />
        Cloud sessions need a GitHub token or SSH key — add yours under API keys, or share one with
        the workspace under Secrets.
      </p>
    </SettingsShell>
  );
}
