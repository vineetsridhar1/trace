import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { ControlButton } from "./bits";
import { Icon } from "./icons";
import { ModalInput, ModalScreen, ModalSelect } from "./modal";

const SOURCE = "src/design/components/settings/automation.tsx";

export type AutomationSection = "setup" | "run" | "apps";

const SECTIONS: {
  id: AutomationSection;
  label: string;
  configured: string[];
  error?: boolean;
}[] = [
  { id: "setup", label: "Setup scripts", configured: ["Install", "Database setup"], error: true },
  { id: "run", label: "Run scripts", configured: ["Dev server", "Tests"] },
  { id: "apps", label: "Applications", configured: ["Web"] },
];

/* Fit configured names onto one muted rail line: "First · Second +N", never wrapping. */
function summarize(names: string[], budget = 26): string {
  if (names.length === 0) return "Not configured";
  let text = "";
  let shown = 0;
  for (const name of names) {
    const candidate = shown === 0 ? name : `${text} · ${name}`;
    if (shown > 0 && candidate.length > budget) break;
    text = candidate;
    shown += 1;
  }
  const remaining = names.length - shown;
  return remaining > 0 ? `${text} +${remaining}` : text;
}

const SECTION_INTRO: Record<AutomationSection, { title: string; description: string; add: string }> = {
  setup: {
    title: "Setup scripts",
    description:
      "Run in order when a session workspace starts. Terminals, run scripts, and applications all wait until every step finishes.",
    add: "Add step",
  },
  run: {
    title: "Run scripts",
    description:
      "Named commands members open as terminals from the session's Run button. For processes Trace should supervise, use an application.",
    add: "Add run script",
  },
  apps: {
    title: "Applications",
    description:
      "Long-running processes Trace starts and supervises inside cloud sessions, with the ports they expose.",
    add: "Add application",
  },
};

/* ---- shared field vocabulary ------------------------------------------- */

function FieldTag({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-[11px] font-medium text-design-muted">{children}</p>;
}

function MiniToggle({ traceId, on, label }: { traceId: string; on: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      data-trace-id={traceId}
      data-trace-source={SOURCE}
      className={cn(
        "relative flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-design ease-design",
        on ? "border-design-primary bg-design-primary" : "border-design-border bg-design-background",
      )}
    >
      <span
        className={cn(
          "absolute h-3.5 w-3.5 rounded-full transition-all duration-design ease-design",
          on ? "left-[18px] bg-design-primary-foreground" : "left-[2px] bg-design-muted",
        )}
      />
    </button>
  );
}

function CommandRow({ idPrefix, command, workdir }: { idPrefix: string; command: string; workdir: string }) {
  return (
    <div className="grid grid-cols-[1fr_180px] gap-3">
      <div>
        <FieldTag>Command</FieldTag>
        <ModalInput traceId={`${idPrefix}-command`} label="Command" value={command} mono />
      </div>
      <div>
        <FieldTag>Working directory</FieldTag>
        <ModalInput traceId={`${idPrefix}-workdir`} label="Working directory" value={workdir} mono />
      </div>
    </div>
  );
}

/* Workspace secrets available to reference — mirrors the Secrets settings screen. */
const WORKSPACE_SECRETS = ["GITHUB_TOKEN", "ANTHROPIC_API_KEY", "DATABASE_URL", "FLY_LAUNCHER_TOKEN"];

/* Open secret picker: the list you get after clicking into a variable's secret cell. */
function SecretPickerOpen({ idPrefix }: { idPrefix: string }) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded
        aria-label="Select secret"
        data-trace-id={`${idPrefix}-trigger`}
        data-trace-source={SOURCE}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-design-control border border-design-primary bg-design-background px-3 text-left text-[13px] text-design-muted ring-2 ring-design-primary/25"
      >
        <span className="font-design-mono text-xs">Select secret</span>
        <Icon name="chevronDown" size={14} className="shrink-0 text-design-muted" />
      </button>
      <ul
        role="listbox"
        aria-label="Workspace secrets"
        data-trace-id={`${idPrefix}-menu`}
        data-trace-source={SOURCE}
        className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-design-control border border-design-border bg-design-surface py-1 shadow-design-surface"
      >
        {WORKSPACE_SECRETS.map((name, index) => (
          <li key={name}>
            <button
              type="button"
              role="option"
              aria-selected={index === 0}
              data-trace-id={`${idPrefix}-opt-${name.toLowerCase()}`}
              data-trace-source={SOURCE}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors",
                index === 0
                  ? "bg-design-background text-design-foreground"
                  : "text-design-muted hover:bg-design-background/60 hover:text-design-foreground",
              )}
            >
              <Icon name="shield" size={13} className="shrink-0 text-design-secondary" />
              <span className="min-w-0 flex-1 truncate font-design-mono text-xs">{name}</span>
              {index === 0 ? <Icon name="check" size={13} className="shrink-0" /> : null}
            </button>
          </li>
        ))}
        <li className="mt-1 border-t border-design-border pt-1">
          <button
            type="button"
            data-trace-id={`${idPrefix}-manage`}
            data-trace-source={SOURCE}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-design-foreground transition-colors hover:bg-design-background/60"
          >
            <Icon name="plus" size={13} className="shrink-0 text-design-secondary" />
            <span className="flex-1">Manage workspace secrets</span>
            <Icon name="externalLink" size={12} className="shrink-0 text-design-secondary" />
          </button>
        </li>
      </ul>
    </div>
  );
}

function EnvVars({
  idPrefix,
  rows,
  adding = false,
}: {
  idPrefix: string;
  rows: { key: string; secret: string; missing?: boolean }[];
  adding?: boolean;
}) {
  return (
    <div data-trace-id={`${idPrefix}-env`} data-trace-source={SOURCE}>
      <div className="flex items-center justify-between gap-3">
        <FieldTag>Environment variables</FieldTag>
        <ControlButton traceId={`${idPrefix}-env-add`} variant="ghost" size="sm" icon="plus">
          Add variable
        </ControlButton>
      </div>
      {rows.length === 0 && !adding ? (
        <p className="text-xs text-design-muted">None — add one to expose a workspace secret here.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.key}>
              <div className="grid grid-cols-[200px_1fr_32px] items-center gap-2">
                <ModalInput
                  traceId={`${idPrefix}-env-${row.key.toLowerCase()}-key`}
                  label={`Variable ${row.key}`}
                  value={row.key}
                  mono
                />
                <ModalSelect
                  traceId={`${idPrefix}-env-${row.key.toLowerCase()}-secret`}
                  label={`Secret for ${row.key}`}
                  value={row.secret}
                  withShield
                  danger={row.missing}
                />
                <ControlButton
                  traceId={`${idPrefix}-env-${row.key.toLowerCase()}-remove`}
                  variant="ghost"
                  size="icon"
                  icon="trash"
                  aria-label={`Remove variable ${row.key}`}
                  className="hover:text-design-danger"
                />
              </div>
              {row.missing ? (
                <p
                  data-trace-id={`${idPrefix}-env-${row.key.toLowerCase()}-missing`}
                  data-trace-source={SOURCE}
                  className="mt-1 flex items-center gap-1.5 text-xs text-design-danger"
                >
                  <Icon name="info" size={12} className="shrink-0" />
                  This secret was removed from workspace Secrets — pick a replacement.
                </p>
              ) : null}
            </div>
          ))}
          {adding ? (
            <div data-trace-id={`${idPrefix}-env-new`} data-trace-source={SOURCE}>
              <div className="grid grid-cols-[200px_1fr_32px] items-start gap-2">
                <input
                  type="text"
                  placeholder="VARIABLE_NAME"
                  aria-label="New variable name"
                  data-trace-id={`${idPrefix}-env-new-key`}
                  data-trace-source={SOURCE}
                  className="h-9 w-full rounded-design-control border border-design-primary bg-design-background px-3 font-design-mono text-xs uppercase text-design-foreground outline-none ring-2 ring-design-primary/25 placeholder:normal-case placeholder:text-design-secondary"
                />
                <SecretPickerOpen idPrefix={`${idPrefix}-env-new-secret`} />
                <ControlButton
                  traceId={`${idPrefix}-env-new-remove`}
                  variant="ghost"
                  size="icon"
                  icon="trash"
                  aria-label="Remove new variable"
                  className="hover:text-design-danger"
                />
              </div>
              <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-4 text-design-muted">
                <Icon name="info" size={12} className="mt-0.5 shrink-0" />
                Name the variable your command reads. Its value is pulled from the chosen secret when
                the runtime starts — the secret value is never shown or stored here.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

const PORT_GRID = "grid grid-cols-[1fr_72px_88px_1fr_64px_32px] items-center gap-2";

function PortsEditor({
  idPrefix,
  ports,
}: {
  idPrefix: string;
  ports: { label: string; port: string; protocol: string; health: string; forward: boolean }[];
}) {
  return (
    <div data-trace-id={`${idPrefix}-ports`} data-trace-source={SOURCE}>
      <div className="flex items-center justify-between gap-3">
        <FieldTag>Ports</FieldTag>
        <ControlButton traceId={`${idPrefix}-ports-add`} variant="ghost" size="sm" icon="plus">
          Add port
        </ControlButton>
      </div>
      <div className="space-y-2">
        <div
          className={cn(
            PORT_GRID,
            "px-px text-[10px] font-semibold uppercase tracking-[0.08em] text-design-secondary",
          )}
        >
          <span>Label</span>
          <span>Port</span>
          <span>Protocol</span>
          <span>Health</span>
          <span>Forward</span>
          <span />
        </div>
        {ports.map((port) => {
          const pid = `${idPrefix}-port-${port.label.toLowerCase().replace(/\s/g, "-")}`;
          return (
            <div key={port.label} data-trace-id={pid} data-trace-source={SOURCE} className={PORT_GRID}>
              <ModalInput traceId={`${pid}-label`} label={`Port ${port.label} label`} value={port.label} />
              <ModalInput traceId={`${pid}-number`} label={`Port ${port.label} number`} value={port.port} mono />
              <ModalSelect traceId={`${pid}-protocol`} label={`Port ${port.label} protocol`} value={port.protocol} />
              <ModalInput
                traceId={`${pid}-health`}
                label={`Port ${port.label} health check path`}
                value={port.health}
                placeholder="/health"
                mono
              />
              <div className="flex justify-center">
                <MiniToggle traceId={`${pid}-forward`} on={port.forward} label={`Auto-forward ${port.label}`} />
              </div>
              <ControlButton
                traceId={`${pid}-remove`}
                variant="ghost"
                size="icon"
                icon="trash"
                aria-label={`Remove port ${port.label}`}
                className="hover:text-design-danger"
              />
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs leading-4 text-design-muted">
        Auto-forwarded ports become preview links on the session once the health check passes.
      </p>
    </div>
  );
}

/* ---- section bodies ---------------------------------------------------- */

function SetupSection({ addingEnv = false }: { addingEnv?: boolean }) {
  return (
    <div className="space-y-2.5">
      {[
        {
          id: "autoedit-step-install",
          n: 1,
          name: "Install",
          command: "pnpm install && pnpm gql:codegen",
          workdir: ".",
          env: [] as { key: string; secret: string; missing?: boolean }[],
          adding: addingEnv,
        },
        {
          id: "autoedit-step-db",
          n: 2,
          name: "Database setup",
          command: "pnpm db:migrate && pnpm db:generate",
          workdir: "apps/server",
          env: [{ key: "DATABASE_URL", secret: "DATABASE_URL", missing: true }],
          adding: false,
        },
      ].map((step) => (
        <div
          key={step.id}
          data-trace-id={step.id}
          data-trace-source={SOURCE}
          className="rounded-design-surface border border-design-border bg-design-surface"
        >
          <div className="flex gap-3 px-4 py-4">
            <span className="mt-6 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-design-border bg-design-background text-[11px] font-semibold text-design-muted">
              {step.n}
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div className="w-56">
                  <FieldTag>Step name</FieldTag>
                  <ModalInput traceId={`${step.id}-name`} label={`Step ${step.n} name`} value={step.name} />
                </div>
                <ControlButton
                  traceId={`${step.id}-remove`}
                  variant="ghost"
                  size="icon"
                  icon="trash"
                  aria-label={`Remove step ${step.name}`}
                  className="mb-0.5 hover:text-design-danger"
                />
              </div>
              <CommandRow idPrefix={step.id} command={step.command} workdir={step.workdir} />
              <EnvVars idPrefix={step.id} rows={step.env} adding={step.adding} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RunScriptsSection() {
  return (
    <div className="rounded-design-surface border border-design-border bg-design-surface px-4 py-3.5">
      <div className="space-y-2">
        <div className="grid grid-cols-[220px_1fr_32px] gap-2 px-px text-[10px] font-semibold uppercase tracking-[0.08em] text-design-secondary">
          <span>Name</span>
          <span>Command</span>
          <span />
        </div>
        {(
          [
            ["Dev server", "pnpm dev"],
            ["Tests", "pnpm test"],
          ] as const
        ).map(([name, command]) => {
          const rid = `autoedit-run-${name.toLowerCase().replace(/\s/g, "-")}`;
          return (
            <div
              key={name}
              data-trace-id={rid}
              data-trace-source={SOURCE}
              className="grid grid-cols-[220px_1fr_32px] items-center gap-2"
            >
              <ModalInput traceId={`${rid}-name`} label={`Run script ${name} name`} value={name} />
              <ModalInput traceId={`${rid}-command`} label={`Run script ${name} command`} value={command} mono />
              <ControlButton
                traceId={`${rid}-remove`}
                variant="ghost"
                size="icon"
                icon="trash"
                aria-label={`Remove run script ${name}`}
                className="hover:text-design-danger"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Collapsed process: one tidy row. Only the process being edited expands. */
function ProcessCollapsed({
  idPrefix,
  name,
  command,
  ports,
  required,
}: {
  idPrefix: string;
  name: string;
  command: string;
  ports: string;
  required: boolean;
}) {
  return (
    <div
      data-trace-id={idPrefix}
      data-trace-source={SOURCE}
      className="flex items-center gap-2.5 border-t border-design-border px-4 py-2.5"
    >
      <Icon name="chevronRight" size={13} className="shrink-0 text-design-secondary" />
      <span className="w-32 shrink-0 truncate text-[13px] font-medium text-design-foreground">{name}</span>
      <code className="min-w-0 flex-1 truncate font-design-mono text-[11px] text-design-muted">{command}</code>
      {required ? (
        <span className="shrink-0 rounded-full border border-design-border px-1.5 py-0.5 text-[10px] font-medium text-design-secondary">
          Starts with app
        </span>
      ) : null}
      <span className="shrink-0 text-[11px] text-design-muted">{ports}</span>
      <ControlButton
        traceId={`${idPrefix}-remove`}
        variant="ghost"
        size="icon"
        icon="trash"
        aria-label={`Remove process ${name}`}
        className="hover:text-design-danger"
      />
    </div>
  );
}

function ApplicationsSection() {
  return (
    <div className="rounded-design-surface border border-design-border bg-design-surface">
      {/* App name */}
      <div
        data-trace-id="autoedit-app-web-header"
        data-trace-source={SOURCE}
        className="flex items-end justify-between gap-3 rounded-t-design-surface bg-design-background/30 px-4 py-3.5"
      >
        <div className="w-56">
          <FieldTag>Application name</FieldTag>
          <ModalInput traceId="autoedit-app-web-name" label="Application name" value="Web" />
        </div>
        <ControlButton
          traceId="autoedit-app-web-remove"
          variant="ghost"
          size="icon"
          icon="trash"
          aria-label="Remove application Web"
          className="mb-0.5 hover:text-design-danger"
        />
      </div>

      {/* Process 1 — expanded for editing */}
      <div
        data-trace-id="autoedit-proc-dev"
        data-trace-source={SOURCE}
        className="space-y-3 border-t border-design-border bg-design-background/20 px-4 py-4"
      >
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-end gap-4">
            <Icon name="chevronDown" size={13} className="mb-2.5 shrink-0 text-design-secondary" />
            <div className="w-52">
              <FieldTag>Process name</FieldTag>
              <ModalInput traceId="autoedit-proc-dev-name" label="Process name" value="Dev server" />
            </div>
            <label className="mb-2 flex items-center gap-2 text-xs text-design-muted">
              <MiniToggle traceId="autoedit-proc-dev-required" on label="Starts with app: Dev server" />
              Starts with app
            </label>
          </div>
          <ControlButton
            traceId="autoedit-proc-dev-remove"
            variant="ghost"
            size="icon"
            icon="trash"
            aria-label="Remove process Dev server"
            className="mb-0.5 hover:text-design-danger"
          />
        </div>
        <CommandRow idPrefix="autoedit-proc-dev" command="pnpm dev:web --host 0.0.0.0 --port 3000" workdir="apps/web" />
        <EnvVars idPrefix="autoedit-proc-dev" rows={[]} />
        <PortsEditor
          idPrefix="autoedit-proc-dev"
          ports={[{ label: "Web", port: "3000", protocol: "http", health: "/", forward: true }]}
        />
      </div>

      {/* Process 2 — collapsed */}
      <ProcessCollapsed
        idPrefix="autoedit-proc-api"
        name="API server"
        command="pnpm dev:server"
        ports="1 port"
        required
      />

      <div className="border-t border-design-border px-4 py-2.5">
        <ControlButton traceId="autoedit-app-web-add-process" variant="ghost" size="sm" icon="plus">
          Add process to Web
        </ControlButton>
      </div>
    </div>
  );
}

/* ---- dialog shell with in-dialog section rail -------------------------- */

export function AutomationDialog({
  active,
  background,
  addingEnv = false,
}: {
  active: AutomationSection;
  background: ReactNode;
  addingEnv?: boolean;
}) {
  const intro = SECTION_INTRO[active];
  const body =
    active === "setup" ? (
      <SetupSection addingEnv={addingEnv} />
    ) : active === "run" ? (
      <RunScriptsSection />
    ) : (
      <ApplicationsSection />
    );
  return (
    <ModalScreen traceId="autoedit-screen" background={background}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Session automation"
        data-trace-id="autoedit-dialog"
        data-trace-source={SOURCE}
        className="flex h-[660px] w-full max-w-[880px] flex-col overflow-hidden rounded-design-surface border border-design-border bg-design-surface shadow-design-surface"
      >
        {/* Header */}
        <div
          data-trace-id="autoedit-header"
          data-trace-source={SOURCE}
          className="flex items-start justify-between gap-4 border-b border-design-border px-6 py-4"
        >
          <div className="min-w-0">
            <h2 className="font-design-display text-[15px] font-semibold tracking-[-0.01em] text-design-foreground">
              Session automation
            </h2>
            <p className="mt-0.5 text-[13px] leading-5 text-design-muted">
              <span className="font-medium text-design-foreground">trace</span> · how sessions on this
              repository install, run, and expose the codebase. Shared by every coding channel.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Session automation"
            data-trace-id="autoedit-close"
            data-trace-source={SOURCE}
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-design-control text-design-muted transition-colors duration-design ease-design hover:bg-design-background hover:text-design-foreground"
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        {/* Body: rail + active section */}
        <div className="flex min-h-0 flex-1">
          <nav
            data-trace-id="autoedit-rail"
            data-trace-source={SOURCE}
            className="w-52 shrink-0 border-r border-design-border p-3"
          >
            <ul className="space-y-px">
              {SECTIONS.map((section) => {
                const isActive = section.id === active;
                return (
                  <li key={section.id}>
                    <a
                      href="#"
                      onClick={(event) => event.preventDefault()}
                      aria-current={isActive ? "page" : undefined}
                      data-trace-id={`autoedit-rail-${section.id}`}
                      data-trace-source={SOURCE}
                      className={cn(
                        "relative block rounded-design-control px-2.5 py-2 transition-colors duration-design ease-design",
                        isActive
                          ? "bg-design-background text-design-foreground"
                          : "hover:bg-design-background/60",
                      )}
                    >
                      {isActive ? (
                        <span className="absolute -left-3 top-2.5 h-5 w-0.5 rounded-full bg-design-primary" />
                      ) : null}
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "min-w-0 flex-1 text-[13px] text-design-foreground",
                            isActive && "font-medium",
                          )}
                        >
                          {section.label}
                        </span>
                        {section.error ? (
                          <span
                            aria-label="Needs attention"
                            data-trace-id={`autoedit-rail-${section.id}-error`}
                            data-trace-source={SOURCE}
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-design-danger"
                          />
                        ) : null}
                      </span>
                      <span
                        data-trace-id={`autoedit-rail-${section.id}-summary`}
                        data-trace-source={SOURCE}
                        className={cn(
                          "mt-0.5 block text-[11px] leading-4",
                          section.configured.length === 0
                            ? "italic text-design-secondary"
                            : "text-design-muted",
                        )}
                      >
                        {summarize(section.configured)}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            <div
              data-trace-id="autoedit-section-intro"
              data-trace-source={SOURCE}
              className="flex items-start justify-between gap-4 border-b border-design-border px-6 py-3.5"
            >
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-design-foreground">{intro.title}</h3>
                <p className="mt-0.5 max-w-[30rem] text-xs leading-4 text-design-muted">
                  {intro.description}
                </p>
              </div>
              <ControlButton traceId={`autoedit-${active}-add`} size="sm" icon="plus">
                {intro.add}
              </ControlButton>
            </div>
            <div
              data-trace-id="autoedit-section-body"
              data-trace-source={SOURCE}
              className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
            >
              {body}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          data-trace-id="autoedit-footer"
          data-trace-source={SOURCE}
          className="flex items-center justify-between gap-3 border-t border-design-border px-6 py-3.5"
        >
          <button
            type="button"
            onClick={(event) => event.preventDefault()}
            data-trace-id="autoedit-footer-issue"
            data-trace-source={SOURCE}
            className="flex min-w-0 items-center gap-1.5 rounded-design-control text-left text-xs text-design-warning transition-colors hover:text-design-foreground"
          >
            <Icon name="info" size={13} className="shrink-0" />
            <span className="truncate">
              1 issue in Setup scripts — <code className="font-design-mono">DATABASE_URL</code> points to a
              removed secret.
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <ControlButton traceId="autoedit-cancel" variant="ghost" size="md">
              Cancel
            </ControlButton>
            <ControlButton traceId="autoedit-save" variant="primary" size="md" disabled>
              Save configuration
            </ControlButton>
          </div>
        </div>
      </div>
    </ModalScreen>
  );
}
