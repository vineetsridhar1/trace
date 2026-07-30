import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon, type IconName } from "./icons";
import { Avatar } from "./bits";

const SOURCE = "src/design/components/settings/SettingsShell.tsx";

export type NavId =
  | "members"
  | "repositories"
  | "agent-environments"
  | "secrets"
  | "integrations"
  | "session-defaults"
  | "api-keys"
  | "devices";

export const NAV_GROUPS: {
  label: string;
  items: { id: NavId; label: string; icon: IconName }[];
}[] = [
  {
    label: "Workspace",
    items: [
      { id: "members", label: "Members", icon: "users" },
      { id: "repositories", label: "Repositories", icon: "gitBranch" },
      { id: "agent-environments", label: "Agent environments", icon: "cloud" },
      { id: "secrets", label: "Secrets", icon: "shield" },
      { id: "integrations", label: "Integrations", icon: "plug" },
    ],
  },
  {
    label: "Your account",
    items: [
      { id: "session-defaults", label: "Session defaults", icon: "sliders" },
      { id: "api-keys", label: "API keys", icon: "key" },
      { id: "devices", label: "Devices & access", icon: "laptop" },
    ],
  },
];

export function SettingsShell({
  screen,
  active,
  title,
  description,
  action,
  width = "narrow",
  children,
}: {
  screen: string;
  active: NavId;
  title: string;
  description?: string;
  action?: ReactNode;
  width?: "narrow" | "wide";
  children: ReactNode;
}) {
  const id = (suffix: string) => `${screen}-${suffix}`;
  return (
    <div
      data-trace-id={id("shell")}
      data-trace-source={SOURCE}
      className="flex h-full flex-col bg-design-background font-design-body text-design-foreground"
    >
      {/* Top bar: workspace context + settings breadcrumb */}
      <header
        data-trace-id={id("topbar")}
        data-trace-source={SOURCE}
        className="flex h-[52px] shrink-0 items-center justify-between border-b border-design-border px-4"
      >
        <div className="flex items-center gap-2.5">
          <span
            data-trace-id={id("topbar-logo")}
            data-trace-source={SOURCE}
            className="flex h-6 w-6 items-center justify-center rounded-md bg-design-primary text-[11px] font-bold text-design-primary-foreground"
          >
            T
          </span>
          <button
            type="button"
            data-trace-id={id("topbar-org")}
            data-trace-source={SOURCE}
            className="flex items-center gap-1.5 rounded-design-control px-1.5 py-1 text-[13px] font-medium text-design-foreground transition-colors hover:bg-design-surface"
          >
            Nighthawk Labs
            <Icon name="chevronDown" size={13} className="text-design-muted" />
          </button>
          <span aria-hidden="true" className="text-design-secondary">/</span>
          <span
            data-trace-id={id("topbar-crumb")}
            data-trace-source={SOURCE}
            className="text-[13px] text-design-muted"
          >
            Settings
          </span>
        </div>
        <div
          data-trace-id={id("topbar-user")}
          data-trace-source={SOURCE}
          className="flex items-center gap-2.5"
        >
          <span className="text-xs text-design-muted">vineet@nighthawk.dev</span>
          <Avatar name="Vineet Sridhar" traceId={id("topbar-avatar")} size="sm" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Grouped navigation: workspace settings vs personal settings */}
        <nav
          data-trace-id={id("nav")}
          data-trace-source={SOURCE}
          className="w-60 shrink-0 overflow-y-auto border-r border-design-border px-3 py-4"
        >
          <label
            data-trace-id={id("nav-search")}
            data-trace-source={SOURCE}
            className="mb-4 flex h-8 items-center gap-2 rounded-design-control border border-design-border bg-design-surface px-2.5 text-design-muted focus-within:border-design-secondary"
          >
            <Icon name="search" size={13} />
            <input
              type="text"
              placeholder="Search settings"
              aria-label="Search settings"
              className="w-full bg-transparent text-[13px] text-design-foreground outline-none placeholder:text-design-muted"
            />
          </label>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <p
                data-trace-id={id(`nav-group-${group.label.toLowerCase().replace(/\s/g, "-")}`)}
                data-trace-source={SOURCE}
                className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-design-secondary"
              >
                {group.label}
              </p>
              <ul className="space-y-px">
                {group.items.map((item) => {
                  const isActive = item.id === active;
                  return (
                    <li key={item.id}>
                      <a
                        href="#"
                        onClick={(event) => event.preventDefault()}
                        aria-current={isActive ? "page" : undefined}
                        data-trace-id={id(`nav-item-${item.id}`)}
                        data-trace-source={SOURCE}
                        className={cn(
                          "relative flex h-8 items-center gap-2.5 rounded-design-control px-2.5 text-[13px] transition-colors duration-design ease-design",
                          isActive
                            ? "bg-design-surface font-medium text-design-foreground"
                            : "text-design-muted hover:bg-design-surface/60 hover:text-design-foreground",
                        )}
                      >
                        {isActive ? (
                          <span className="absolute -left-3 top-1.5 h-5 w-0.5 rounded-full bg-design-primary" />
                        ) : null}
                        <Icon name={item.icon} size={15} className={isActive ? "" : "text-design-secondary"} />
                        {item.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Content pane */}
        <div className="flex-1 overflow-y-auto">
          <div
            data-trace-id={id("content")}
            data-trace-source={SOURCE}
            className={cn("mx-auto px-10 py-8", width === "wide" ? "max-w-[1000px]" : "max-w-[760px]")}
          >
            <div
              data-trace-id={id("page-header")}
              data-trace-source={SOURCE}
              className="mb-6 flex items-start justify-between gap-6"
            >
              <div className="min-w-0">
                <h1
                  data-trace-id={id("page-title")}
                  data-trace-source={SOURCE}
                  className="font-design-display text-xl font-semibold tracking-[-0.01em]"
                >
                  {title}
                </h1>
                {description ? (
                  <p
                    data-trace-id={id("page-description")}
                    data-trace-source={SOURCE}
                    className="mt-1 text-[13px] leading-5 text-design-muted"
                  >
                    {description}
                  </p>
                ) : null}
              </div>
              {action ? <div className="shrink-0">{action}</div> : null}
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
