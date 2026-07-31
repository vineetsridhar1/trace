import { useState, type ReactNode } from "react";
import { DesignScreen } from "../primitives/DesignScreen";
import "../fonts.css";

type ComposerView = "default" | "picker" | "ready";
type SessionType = "code" | "design" | "app" | "pdf" | "animation";

type SessionComposerProps = {
  initialView: ComposerView;
  sessionType?: SessionType;
};

function Icon({
  children,
  className = "",
  filled = false,
}: {
  children: ReactNode;
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 ${className}`}
      fill={filled ? "currentColor" : "none"}
      viewBox="0 0 24 24"
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function Chevron({ className = "" }: { className?: string }) {
  return (
    <Icon className={`h-3 w-3 text-design-muted ${className}`}>
      <path d="m8 10 4 4 4-4" />
    </Icon>
  );
}

function Spark({ className = "" }: { className?: string }) {
  return (
    <Icon className={className} filled>
      <path d="M12 2.5c.62 4.6 4.28 8.26 8.88 8.88.83.11.83 1.13 0 1.24-4.6.62-8.26 4.28-8.88 8.88-.11.83-1.13.83-1.24 0-.62-4.6-4.28-8.26-8.88-8.88-.83-.11-.83-1.13 0-1.24 4.6-.62 8.26-4.28 8.88-8.88.11-.83 1.13-.83 1.24 0Z" />
    </Icon>
  );
}

function FolderIcon({ className = "" }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3.5 6.5a2 2 0 0 1 2-2h3.6l2 2.2h7.4a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
    </Icon>
  );
}

function ContextChip({
  label,
  value,
  unset = false,
  active = false,
  online = false,
  onClick,
  traceId,
}: {
  label: string;
  value: string;
  unset?: boolean;
  active?: boolean;
  online?: boolean;
  onClick?: () => void;
  traceId: string;
}) {
  return (
    <button
      type="button"
      data-trace-id={traceId}
      data-trace-source="src/design/components/SessionComposer.tsx"
      onClick={onClick}
      aria-haspopup="listbox"
      aria-expanded={active}
      aria-label={`${label}: ${value}`}
      className={`flex h-8 items-center gap-1.5 rounded-design-control border px-2.5 text-[13px] leading-none transition duration-design ${
        active
          ? "border-design-secondary bg-design-background"
          : unset
            ? "border-dashed border-design-border hover:border-design-secondary hover:bg-design-background"
            : "border-design-border hover:bg-design-background"
      }`}
    >
      <span className="text-design-muted">{label}</span>
      {online ? <span className="h-1.5 w-1.5 rounded-full bg-design-success" /> : null}
      <span className={unset ? "text-design-muted" : "font-medium text-design-foreground"}>
        {value}
      </span>
      <Chevron />
    </button>
  );
}

const SESSION_TYPES: { id: SessionType; label: string; icon: ReactNode }[] = [
  {
    id: "code",
    label: "Code",
    icon: (
      <Icon className="h-3.5 w-3.5">
        <path d="m9 8.5-3.5 3.5L9 15.5M15 8.5l3.5 3.5L15 15.5" />
      </Icon>
    ),
  },
  {
    id: "design",
    label: "Design",
    icon: (
      <Icon className="h-3.5 w-3.5">
        <path d="M8 3v18M16 3v18M3 8h18M3 16h18" />
      </Icon>
    ),
  },
  {
    id: "app",
    label: "App",
    icon: (
      <Icon className="h-3.5 w-3.5">
        <rect x="3" y="4.5" width="18" height="15" rx="2" />
        <path d="M3 9h18" />
      </Icon>
    ),
  },
  {
    id: "pdf",
    label: "PDF",
    icon: (
      <Icon className="h-3.5 w-3.5">
        <path d="M6 3h8l4 4v14H6Z" />
        <path d="M14 3v4h4" />
      </Icon>
    ),
  },
  {
    id: "animation",
    label: "Animation",
    icon: (
      <Icon className="h-3.5 w-3.5">
        <path d="M12 3.5 19.5 12 12 20.5 4.5 12Z" />
      </Icon>
    ),
  },
];

const SAMPLE_PROMPTS: Record<SessionType, string> = {
  code: "Add an empty state to the projects page and match the existing visual language.",
  design: "Design the onboarding flow for our mobile banking app — four screens, calm and trustworthy.",
  app: "Build an internal tool for triaging customer feedback into weekly themes.",
  pdf: "Turn the Q3 platform review into a shareable one-page summary.",
  animation: "Animate the new logo reveal for the product launch page.",
};

const NAV_ITEMS = [
  {
    label: "Sessions",
    active: true,
    count: "4",
    icon: (
      <Icon className="h-[15px] w-[15px]">
        <path d="M4 5.5h16M4 12h16M4 18.5h10" />
      </Icon>
    ),
  },
  {
    label: "Projects",
    active: false,
    count: "",
    icon: <FolderIcon className="h-[15px] w-[15px]" />,
  },
  {
    label: "Bridges",
    active: false,
    count: "",
    icon: (
      <Icon className="h-[15px] w-[15px]">
        <path d="M4 17V7m0 7.5h4.5a3 3 0 0 0 0-6H4M20 7v10m0-7.5h-4.5a3 3 0 0 0 0 6H20" />
      </Icon>
    ),
  },
];

const RECENT_SESSIONS = [
  "Projects page empty state",
  "Fix flaky auth callback test",
  "Migrate billing to usage tiers",
];

function Sidebar() {
  return (
    <aside
      data-trace-id="session-sidebar"
      data-trace-source="src/design/components/SessionComposer.tsx"
      className="flex w-[248px] shrink-0 flex-col border-r border-design-border px-3 pb-3 pt-4"
    >
      <div className="flex items-center gap-2 px-2">
        <Spark className="h-[18px] w-[18px] text-design-warning" />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Trace</span>
      </div>

      <button
        data-trace-id="sidebar-new-session"
        data-trace-source="src/design/components/SessionComposer.tsx"
        className="mt-5 flex h-9 items-center gap-2 rounded-design-control bg-design-primary px-3 text-[13px] font-medium text-design-primary-foreground transition duration-design hover:opacity-90"
      >
        <Icon className="h-3.5 w-3.5">
          <path d="M12 5v14M5 12h14" />
        </Icon>
        New session
      </button>

      <nav className="mt-6" aria-label="Workspace">
        <p className="px-2 pb-1.5 text-[11px] font-medium tracking-[0.02em] text-design-muted">
          Workspace
        </p>
        <ul className="space-y-px">
          {NAV_ITEMS.map((item) => (
            <li key={item.label}>
              <a
                href="#"
                onClick={(event) => event.preventDefault()}
                aria-current={item.active ? "page" : undefined}
                className={`flex h-8 items-center gap-2.5 rounded-design-control px-2 text-[13px] transition duration-design ${
                  item.active
                    ? "bg-design-surface text-design-foreground"
                    : "text-design-muted hover:bg-design-surface hover:text-design-foreground"
                }`}
              >
                {item.icon}
                {item.label}
                {item.count ? (
                  <span className="ml-auto text-[11px] text-design-muted">{item.count}</span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6">
        <p className="px-2 pb-1.5 text-[11px] font-medium tracking-[0.02em] text-design-muted">
          Recent
        </p>
        <ul className="space-y-px">
          {RECENT_SESSIONS.map((title) => (
            <li key={title}>
              <a
                href="#"
                onClick={(event) => event.preventDefault()}
                className="flex h-8 items-center rounded-design-control px-2 text-[13px] text-design-muted transition duration-design hover:bg-design-surface hover:text-design-foreground"
              >
                <span className="truncate">{title}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto border-t border-design-border pt-3">
        <button className="flex w-full items-center gap-2.5 rounded-design-control px-2 py-1.5 text-left transition duration-design hover:bg-design-surface">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-design-border bg-design-surface text-[10px] font-semibold text-design-muted">
            AM
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium">Alex Morgan</span>
            <span className="block truncate text-[11px] text-design-muted">
              Wavelength workspace
            </span>
          </span>
          <Icon className="h-3.5 w-3.5 text-design-muted">
            <path d="M8 10l4 4 4-4" />
          </Icon>
        </button>
      </div>
    </aside>
  );
}

const RECENT_PROJECTS = [
  { name: "kingfisher", path: "wavelength / product", when: "Today", active: true },
  { name: "shoreline-web", path: "wavelength / marketing", when: "Tue", active: false },
  { name: "atlas-api", path: "wavelength / platform", when: "Jul 24", active: false },
];

function ProjectPicker({ onSelect }: { onSelect: () => void }) {
  return (
    <div
      data-trace-id="project-picker"
      data-trace-source="src/design/components/SessionComposer.tsx"
      role="listbox"
      aria-label="Choose a project"
      className="absolute left-3 top-[calc(100%+4px)] z-30 w-[340px] overflow-hidden rounded-[12px] border border-design-border bg-design-surface shadow-design-surface"
    >
      <div className="border-b border-design-border p-2">
        <label className="flex h-9 items-center gap-2 rounded-design-control bg-design-background px-3 text-design-muted">
          <Icon className="h-3.5 w-3.5">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </Icon>
          <input
            autoFocus
            aria-label="Find a project"
            className="w-full bg-transparent text-[13px] text-design-foreground outline-none placeholder:text-design-muted"
            placeholder="Find a project…"
          />
        </label>
      </div>

      <div className="p-1.5">
        <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-design-muted">Recent</p>
        {RECENT_PROJECTS.map((project) => (
          <button
            key={project.name}
            type="button"
            role="option"
            aria-selected={project.active}
            onClick={onSelect}
            className={`flex w-full items-center gap-2.5 rounded-design-control px-2 py-2 text-left transition duration-design ${
              project.active ? "bg-design-background" : "hover:bg-design-background"
            }`}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] bg-design-background text-design-muted">
              <FolderIcon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{project.name}</span>
              <span className="block truncate text-[11.5px] text-design-muted">{project.path}</span>
            </span>
            {project.active ? (
              <kbd className="rounded border border-design-border px-1 text-[10px] text-design-muted">
                ↵
              </kbd>
            ) : (
              <span className="text-[11px] text-design-muted">{project.when}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex h-10 items-center justify-between border-t border-design-border px-3">
        <span className="flex items-center gap-1.5 text-[11px] text-design-muted">
          <kbd className="rounded border border-design-border px-1 text-[10px]">↑</kbd>
          <kbd className="rounded border border-design-border px-1 text-[10px]">↓</kbd>
          to navigate
        </span>
        <button className="text-[12px] font-medium text-design-foreground transition duration-design hover:text-design-muted">
          Browse all projects
        </button>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  ariaLabel,
  iconOnly = false,
}: {
  children: ReactNode;
  ariaLabel?: string;
  iconOnly?: boolean;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={`flex h-8 items-center gap-1.5 rounded-design-control text-[13px] text-design-muted transition duration-design hover:bg-design-background hover:text-design-foreground ${
        iconOnly ? "w-8 justify-center" : "px-2"
      }`}
    >
      {children}
    </button>
  );
}

export function SessionComposer({ initialView, sessionType = "code" }: SessionComposerProps) {
  const [view, setView] = useState<ComposerView>(initialView);
  const [type, setType] = useState<SessionType>(sessionType);
  const configured = view === "ready";
  const pickerOpen = view === "picker";
  const rootId = `new-session-${sessionType === "code" ? initialView : sessionType}`;

  return (
    <DesignScreen
      data-trace-id={rootId}
      data-trace-source="src/design/components/SessionComposer.tsx"
      className="flex overflow-hidden antialiased"
    >
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-design-border px-6">
          <p className="text-[13px] font-medium">New session</p>
          <p className="flex items-center gap-1.5 text-[12px] text-design-muted">
            <kbd className="rounded border border-design-border px-1.5 py-0.5 text-[10px]">Esc</kbd>
            to close
          </p>
        </header>

        <main className="relative flex flex-1 justify-center overflow-auto px-10 pb-12">
          <section
            data-trace-id="session-composer"
            data-trace-source="src/design/components/SessionComposer.tsx"
            className="w-full max-w-[680px] pt-[68px]"
          >
            <h1
              data-trace-id="composer-heading"
              data-trace-source="src/design/components/SessionComposer.tsx"
              className="text-center font-design-display text-[26px] font-semibold tracking-[-0.02em]"
            >
              What are you making?
            </h1>
            <p className="mt-2 text-center text-[14px] leading-6 text-design-muted">
              Describe it — Trace routes it to the right kind of session.
            </p>

            <div
              data-trace-id="task-and-context"
              data-trace-source="src/design/components/SessionComposer.tsx"
              className="mt-7 rounded-design-surface border border-design-border bg-design-surface shadow-design-surface"
            >
              <textarea
                key={type}
                id={`session-prompt-${rootId}`}
                data-trace-id="session-prompt"
                data-trace-source="src/design/components/SessionComposer.tsx"
                aria-label="Describe your task"
                defaultValue={configured ? SAMPLE_PROMPTS[type] : ""}
                placeholder="Describe what you want to make…"
                className="block h-[116px] w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[15px] leading-[1.55] text-design-foreground outline-none placeholder:text-design-muted"
              />

              <div
                data-trace-id="task-context"
                data-trace-source="src/design/components/SessionComposer.tsx"
                className="relative flex h-[52px] items-center gap-2 border-t border-design-border px-3"
              >
                {type === "code" ? (
                  <>
                    <span className="pl-1 pr-0.5 text-[12px] text-design-muted">Run in</span>
                    <ContextChip
                      traceId="context-project"
                      label="Project"
                      value={configured ? "kingfisher" : "Select…"}
                      unset={!configured && !pickerOpen}
                      active={pickerOpen}
                      onClick={() => setView(pickerOpen ? "default" : "picker")}
                    />
                    {pickerOpen ? <ProjectPicker onSelect={() => setView("ready")} /> : null}
                    <ContextChip
                      traceId="context-bridge"
                      label="Bridge"
                      value={configured ? "Local" : "Auto"}
                      online={configured}
                    />
                    <ContextChip traceId="context-model" label="Model" value="Sonnet 4.5" />
                  </>
                ) : (
                  <>
                    <span className="pl-1 pr-0.5 text-[12px] text-design-muted">Using</span>
                    {type === "design" ? (
                      <ContextChip
                        traceId="context-design-system"
                        label="Design system"
                        value="Trace Default"
                      />
                    ) : null}
                    <ContextChip traceId="context-model" label="Model" value="Sonnet 4.5" />
                  </>
                )}
              </div>

              <div className="flex h-[52px] items-center border-t border-design-border px-3">
                <ActionButton ariaLabel="Attach files" iconOnly>
                  <Icon>
                    <path d="m20.5 11.5-8.7 8.7a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8l8.3-8.3" />
                  </Icon>
                </ActionButton>
                {type === "design" ? (
                  <ActionButton ariaLabel="Sketch an idea" iconOnly>
                    <Icon>
                      <path d="M13 5.5 18.5 11M4 20l1-4.5L16.5 4a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L8.5 19Z" />
                    </Icon>
                  </ActionButton>
                ) : (
                  <ActionButton>
                    <Icon className="h-3.5 w-3.5">
                      <path d="M4 5h16v14H4zM4 9h16M9 9v10" />
                    </Icon>
                    Attach design
                    {type === "app" ? <Chevron /> : null}
                  </ActionButton>
                )}

                <div className="ml-auto flex items-center gap-2">
                  {type === "code" ? (
                    <>
                      <button
                        data-trace-id="mode-settings"
                        data-trace-source="src/design/components/SessionComposer.tsx"
                        className="flex h-8 items-center gap-1.5 rounded-design-control px-2 text-[13px] text-design-muted transition duration-design hover:bg-design-background hover:text-design-foreground"
                      >
                        <Icon className="h-3.5 w-3.5">
                          <path d="M4 8h10M18 8h2M4 16h2M10 16h10" />
                          <circle cx="16" cy="8" r="2" />
                          <circle cx="8" cy="16" r="2" />
                        </Icon>
                        Code · Standard
                        <Chevron />
                      </button>
                      <span className="h-4 w-px bg-design-border" />
                    </>
                  ) : null}
                  <button
                    data-trace-id="start-session"
                    data-trace-source="src/design/components/SessionComposer.tsx"
                    onClick={() => setView("ready")}
                    className={`flex h-8 items-center gap-1.5 rounded-design-control px-3 text-[13px] font-medium transition duration-design ${
                      configured
                        ? "bg-design-primary text-design-primary-foreground hover:opacity-90"
                        : "bg-design-background text-design-muted"
                    }`}
                  >
                    Start session
                    <Icon className="h-3.5 w-3.5">
                      <path d="M6 12h12M13 7l5 5-5 5" />
                    </Icon>
                  </button>
                </div>
              </div>
            </div>

            <div
              data-trace-id="session-type-picker"
              data-trace-source="src/design/components/SessionComposer.tsx"
              role="radiogroup"
              aria-label="Session type"
              className="mt-5 flex justify-center gap-2"
            >
              {SESSION_TYPES.map((entry) => {
                const selected = entry.id === type;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setType(entry.id)}
                    className={`flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] transition duration-design ${
                      selected
                        ? "border-design-foreground bg-design-surface font-medium text-design-foreground"
                        : "border-design-border text-design-muted hover:bg-design-surface hover:text-design-foreground"
                    }`}
                  >
                    {entry.icon}
                    {entry.label}
                  </button>
                );
              })}
            </div>

            {configured ? (
              <p
                data-trace-id="ready-summary"
                data-trace-source="src/design/components/SessionComposer.tsx"
                className="mt-5 flex items-center justify-center gap-2 text-[13px] text-design-muted"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-design-success" />
                {type === "code" ? (
                  <span>
                    Ready — <span className="font-medium text-design-foreground">kingfisher</span> on
                    the <span className="font-medium text-design-foreground">local bridge</span> with{" "}
                    <span className="font-medium text-design-foreground">Claude Sonnet 4.5</span>
                  </span>
                ) : type === "design" ? (
                  <span>
                    Ready — a new canvas with{" "}
                    <span className="font-medium text-design-foreground">Trace Default</span> and{" "}
                    <span className="font-medium text-design-foreground">Claude Sonnet 4.5</span>
                  </span>
                ) : (
                  <span>
                    Ready — a hosted app workspace with{" "}
                    <span className="font-medium text-design-foreground">Claude Sonnet 4.5</span>
                  </span>
                )}
              </p>
            ) : pickerOpen ? null : (
              <p className="mt-5 text-center text-[12px] text-design-muted">
                {type === "code"
                  ? "Code sessions run in your project over a bridge — mode and permissions stay editable after launch."
                  : type === "design"
                    ? "Designs open on the canvas — no project, bridge, or permissions to set up."
                    : type === "app"
                      ? "Apps run hosted in Trace — attach a design to start from it."
                      : "Options adjust to the kind of session you pick."}
              </p>
            )}
          </section>
        </main>
      </div>
    </DesignScreen>
  );
}
