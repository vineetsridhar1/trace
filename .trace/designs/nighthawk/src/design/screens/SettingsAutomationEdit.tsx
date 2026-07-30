import SettingsRepositories from "./SettingsRepositories";
import { ControlButton } from "../components/settings/bits";
import { Icon } from "../components/settings/icons";
import {
  ModalDialog,
  ModalField,
  ModalInput,
  ModalScreen,
} from "../components/settings/modal";

const SOURCE = "src/design/screens/SettingsAutomationEdit.tsx";

const RUN_SCRIPTS = [
  ["Dev server", "pnpm dev"],
  ["Tests", "pnpm test"],
] as const;

export default function SettingsAutomationEdit() {
  return (
    <ModalScreen traceId="autoedit-screen" background={<SettingsRepositories />}>
      <ModalDialog
        traceId="autoedit-dialog"
        title="Edit session automation"
        description={
          <>
            <span className="font-medium text-design-foreground">trace</span> · shared by every
            coding channel on this repository.
          </>
        }
        width={620}
        footerLeft={
          <span
            data-trace-id="autoedit-dirty"
            data-trace-source={SOURCE}
            className="flex items-center gap-1.5 text-xs text-design-warning"
          >
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
            Unsaved changes
          </span>
        }
        footerRight={
          <>
            <ControlButton traceId="autoedit-cancel" variant="ghost" size="md">
              Cancel
            </ControlButton>
            <ControlButton traceId="autoedit-save" variant="primary" size="md">
              Save changes
            </ControlButton>
          </>
        }
      >
        <div className="space-y-6">
          <ModalField
            traceId="autoedit-setup"
            label="Setup script"
            hint="Runs once from the repository root when a session workspace starts. Terminals stay blocked until it finishes."
          >
            <textarea
              rows={4}
              aria-label="Setup script"
              data-trace-id="autoedit-setup-input"
              data-trace-source={SOURCE}
              defaultValue={"pnpm install\npnpm gql:codegen"}
              placeholder="e.g. npm install && npm run build"
              className="w-full resize-none rounded-design-control border border-design-border bg-design-background px-3 py-2 font-design-mono text-xs leading-5 text-design-foreground outline-none transition-colors duration-design ease-design placeholder:text-design-secondary focus:border-design-primary focus:ring-2 focus:ring-design-primary/25"
            />
          </ModalField>

          <div data-trace-id="autoedit-run-scripts" data-trace-source={SOURCE}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-design-muted">
                Run scripts
                <span
                  data-trace-id="autoedit-run-count"
                  data-trace-source={SOURCE}
                  className="ml-1.5 rounded-full border border-design-border px-1.5 py-px text-[10px] font-medium text-design-secondary"
                >
                  3 of 10
                </span>
              </p>
              <ControlButton traceId="autoedit-run-add" size="sm" icon="plus">
                Add run script
              </ControlButton>
            </div>
            <div className="space-y-2">
              <div
                data-trace-id="autoedit-run-header"
                data-trace-source={SOURCE}
                className="grid grid-cols-[160px_1fr_32px] gap-2 px-px text-[10px] font-semibold uppercase tracking-[0.08em] text-design-secondary"
              >
                <span>Name</span>
                <span>Command</span>
                <span />
              </div>
              {RUN_SCRIPTS.map(([name, command]) => (
                <div
                  key={name}
                  data-trace-id={`autoedit-run-${name.toLowerCase().replace(/\s/g, "-")}`}
                  data-trace-source={SOURCE}
                  className="grid grid-cols-[160px_1fr_32px] items-center gap-2"
                >
                  <ModalInput traceId={`autoedit-run-${name.toLowerCase().replace(/\s/g, "-")}-name`} label={`Run script ${name} name`} value={name} />
                  <ModalInput
                    traceId={`autoedit-run-${name.toLowerCase().replace(/\s/g, "-")}-command`}
                    label={`Run script ${name} command`}
                    value={command}
                    mono
                  />
                  <ControlButton
                    traceId={`autoedit-run-${name.toLowerCase().replace(/\s/g, "-")}-remove`}
                    variant="ghost"
                    size="icon"
                    icon="trash"
                    aria-label={`Remove run script ${name}`}
                    className="hover:text-design-danger"
                  />
                </div>
              ))}
              {/* Row just added — focused, not yet named */}
              <div
                data-trace-id="autoedit-run-new"
                data-trace-source={SOURCE}
                className="grid grid-cols-[160px_1fr_32px] items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="Name"
                  aria-label="New run script name"
                  data-trace-id="autoedit-run-new-name"
                  data-trace-source={SOURCE}
                  className="h-9 w-full rounded-design-control border border-design-primary bg-design-background px-3 text-[13px] text-design-foreground outline-none ring-2 ring-design-primary/25 placeholder:text-design-secondary"
                />
                <ModalInput
                  traceId="autoedit-run-new-command"
                  label="New run script command"
                  placeholder="Command to run"
                  mono
                />
                <ControlButton
                  traceId="autoedit-run-new-remove"
                  variant="ghost"
                  size="icon"
                  icon="trash"
                  aria-label="Remove new run script"
                  className="hover:text-design-danger"
                />
              </div>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs leading-4 text-design-muted">
              <Icon name="terminal" size={12} className="shrink-0" />
              Each run script opens as a named terminal from the session's Run button.
            </p>
          </div>
        </div>
      </ModalDialog>
    </ModalScreen>
  );
}
