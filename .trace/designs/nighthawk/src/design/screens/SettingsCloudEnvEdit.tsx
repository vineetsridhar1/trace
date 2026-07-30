import SettingsAgentEnvironments from "./SettingsAgentEnvironments";
import { ControlButton } from "../components/settings/bits";
import { Icon } from "../components/settings/icons";
import {
  ModalDialog,
  ModalField,
  ModalInput,
  ModalScreen,
} from "../components/settings/modal";

const SOURCE = "src/design/screens/SettingsCloudEnvEdit.tsx";

const ENDPOINTS = [
  ["Start", "POST", "https://launcher.nighthawk.dev/v1/runtimes/start"],
  ["Stop", "POST", "https://launcher.nighthawk.dev/v1/runtimes/stop"],
  ["Status", "GET", "https://launcher.nighthawk.dev/v1/runtimes/status"],
] as const;

const RUNTIME_VARS = [
  ["GITHUB_TOKEN", "GITHUB_TOKEN"],
  ["ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"],
] as const;

/* Static select trigger at dialog density — value + chevron, secret values carry a shield. */
function SelectTrigger({
  traceId,
  value,
  withShield = false,
  label,
}: {
  traceId: string;
  value: string;
  withShield?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-haspopup="listbox"
      aria-label={label}
      data-trace-id={traceId}
      data-trace-source={SOURCE}
      className="flex h-9 w-full items-center justify-between gap-2 rounded-design-control border border-design-border bg-design-background px-3 text-left text-[13px] text-design-foreground transition-colors duration-design ease-design hover:border-design-secondary"
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        {withShield ? <Icon name="shield" size={13} className="shrink-0 text-design-muted" /> : null}
        <span className="truncate font-design-mono text-xs">{value}</span>
      </span>
      <Icon name="chevronDown" size={14} className="shrink-0 text-design-muted" />
    </button>
  );
}

export default function SettingsCloudEnvEdit() {
  return (
    <ModalScreen traceId="cloudedit-screen" background={<SettingsAgentEnvironments />}>
      <ModalDialog
        traceId="cloudedit-dialog"
        title="Edit cloud environment"
        description="Trace calls these launcher endpoints to start a runtime for each session, poll it while it boots, and stop it when the session ends."
        width={660}
        footerLeft={
          <>
            <ControlButton traceId="cloudedit-test" size="sm" icon="zap">
              Test connection
            </ControlButton>
            <span
              data-trace-id="cloudedit-test-last"
              data-trace-source={SOURCE}
              className="truncate text-xs text-design-muted"
            >
              Last passed today at 2:41 PM
            </span>
          </>
        }
        footerRight={
          <>
            <ControlButton traceId="cloudedit-cancel" variant="ghost" size="md">
              Cancel
            </ControlButton>
            <ControlButton traceId="cloudedit-save" variant="primary" size="md">
              Save changes
            </ControlButton>
          </>
        }
      >
        <div className="space-y-4">
          <ModalField traceId="cloudedit-name" label="Name" required>
            <ModalInput traceId="cloudedit-name-input" label="Environment name" value="Fly.io launcher" />
          </ModalField>

          {/* Endpoints as labeled rows — replaces the cramped three-column URL grid */}
          <ModalField
            traceId="cloudedit-endpoints"
            label="Launcher endpoints"
            hint="Requests are sent with the bearer secret below. Paths can live on any host you control."
          >
            <div className="space-y-2">
              {ENDPOINTS.map(([name, method, url]) => (
                <div
                  key={name}
                  data-trace-id={`cloudedit-endpoint-${name.toLowerCase()}`}
                  data-trace-source={SOURCE}
                  className="flex items-center gap-2"
                >
                  <span className="w-12 shrink-0 text-xs text-design-muted">{name}</span>
                  <span className="w-12 shrink-0 rounded-md border border-design-border bg-design-background py-1 text-center font-design-mono text-[10px] text-design-muted">
                    {method}
                  </span>
                  <ModalInput
                    traceId={`cloudedit-endpoint-${name.toLowerCase()}-input`}
                    label={`${name} URL`}
                    value={url}
                    mono
                  />
                </div>
              ))}
            </div>
          </ModalField>

          <div className="grid grid-cols-[1fr_180px] gap-4">
            <ModalField
              traceId="cloudedit-secret"
              label="Bearer secret"
              required
              hint="Manage values in Workspace → Secrets."
            >
              <SelectTrigger
                traceId="cloudedit-secret-trigger"
                value="FLY_LAUNCHER_TOKEN"
                withShield
                label="Bearer secret"
              />
            </ModalField>
            <ModalField
              traceId="cloudedit-timeout"
              label="Startup timeout"
              hint="Wait before a start fails."
            >
              <div className="relative">
                <ModalInput
                  traceId="cloudedit-timeout-input"
                  label="Startup timeout in seconds"
                  value="180"
                  className="pr-16"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-design-muted">
                  seconds
                </span>
              </div>
            </ModalField>
          </div>

          {/* Runtime env vars: name → secret pairs with an explicit add affordance */}
          <div data-trace-id="cloudedit-runtime-env" data-trace-source={SOURCE}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-design-muted">Runtime environment variables</p>
              <ControlButton traceId="cloudedit-var-add" size="sm" icon="plus">
                Add variable
              </ControlButton>
            </div>
            <div className="space-y-2">
              {RUNTIME_VARS.map(([name, secret]) => (
                <div
                  key={name}
                  data-trace-id={`cloudedit-var-${name.toLowerCase()}`}
                  data-trace-source={SOURCE}
                  className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
                >
                  <ModalInput traceId={`cloudedit-var-${name.toLowerCase()}-name`} label={`Variable ${name}`} value={name} mono />
                  <SelectTrigger
                    traceId={`cloudedit-var-${name.toLowerCase()}-secret`}
                    value={secret}
                    withShield
                    label={`Secret for ${name}`}
                  />
                  <ControlButton
                    traceId={`cloudedit-var-${name.toLowerCase()}-remove`}
                    variant="ghost"
                    size="icon"
                    icon="trash"
                    aria-label={`Remove variable ${name}`}
                    className="hover:text-design-danger"
                  />
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-xs leading-4 text-design-muted">
              Injected when a runtime starts, so sessions read credentials without committing them.
            </p>
          </div>

          {/* Launcher metadata: optional, with inline JSON validation instead of a save-time error */}
          <ModalField
            traceId="cloudedit-metadata"
            label="Launcher metadata · optional"
          >
            <textarea
              rows={4}
              aria-label="Launcher metadata JSON"
              data-trace-id="cloudedit-metadata-input"
              data-trace-source={SOURCE}
              defaultValue={'{\n  "region": "iad",\n  "vm_size": "performance-2x"\n}'}
              className="w-full resize-none rounded-design-control border border-design-border bg-design-background px-3 py-2 font-design-mono text-xs leading-5 text-design-foreground outline-none transition-colors duration-design ease-design focus:border-design-primary focus:ring-2 focus:ring-design-primary/25"
            />
            <p
              data-trace-id="cloudedit-metadata-valid"
              data-trace-source={SOURCE}
              className="mt-1 flex items-center gap-1.5 text-xs text-design-success"
            >
              <Icon name="check" size={12} className="shrink-0" />
              Valid JSON — sent with every start request for provider-specific settings.
            </p>
          </ModalField>
        </div>
      </ModalDialog>
    </ModalScreen>
  );
}
