import { NAV_GROUPS } from "../components/settings/SettingsShell";
import { StatusPill } from "../components/settings/bits";
import { Icon } from "../components/settings/icons";

const SOURCE = "src/design/screens/SettingsMobileNav.tsx";

/* Responsive intent: on small screens the sidebar becomes a grouped list page.
   The current app collapses nine tabs into a horizontal scroll strip instead. */
export default function SettingsMobileNav() {
  return (
    <main
      data-trace-id="m-settings"
      data-trace-source={SOURCE}
      className="flex h-full flex-col bg-design-background font-design-body text-design-foreground"
    >
      <header
        data-trace-id="m-settings-header"
        data-trace-source={SOURCE}
        className="shrink-0 border-b border-design-border px-4 pb-3 pt-14"
      >
        <div className="flex items-center justify-between">
          <h1 className="font-design-display text-[22px] font-semibold tracking-[-0.01em]">
            Settings
          </h1>
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-design-primary text-xs font-bold text-design-primary-foreground">
            T
          </span>
        </div>
        <p className="mt-0.5 text-[13px] text-design-muted">Nighthawk Labs · vineet@nighthawk.dev</p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <label
          data-trace-id="m-settings-search"
          data-trace-source={SOURCE}
          className="mb-5 flex h-11 items-center gap-2.5 rounded-design-control border border-design-border bg-design-surface px-3 text-design-muted"
        >
          <Icon name="search" size={15} />
          <input
            type="text"
            placeholder="Search settings"
            aria-label="Search settings"
            className="w-full bg-transparent text-[15px] text-design-foreground outline-none placeholder:text-design-muted"
          />
        </label>

        {NAV_GROUPS.map((group) => (
          <section
            key={group.label}
            data-trace-id={`m-settings-group-${group.label.toLowerCase().replace(/\s/g, "-")}`}
            data-trace-source={SOURCE}
            className="mb-6"
          >
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-design-secondary">
              {group.label}
            </p>
            <div className="overflow-hidden rounded-design-surface border border-design-border bg-design-surface">
              {group.items.map((item, index) => (
                <a
                  key={item.id}
                  href="#"
                  onClick={(event) => event.preventDefault()}
                  data-trace-id={`m-settings-item-${item.id}`}
                  data-trace-source={SOURCE}
                  className={
                    "flex min-h-[52px] items-center gap-3 px-4 py-3 transition-colors active:bg-design-background/60 " +
                    (index > 0 ? "border-t border-design-border" : "")
                  }
                >
                  <Icon name={item.icon} size={17} className="shrink-0 text-design-secondary" />
                  <span className="min-w-0 flex-1 text-[15px] text-design-foreground">
                    {item.label}
                  </span>
                  {item.id === "devices" ? (
                    <StatusPill tone="warning" label="1 request" traceId="m-settings-devices-badge" />
                  ) : null}
                  <Icon name="chevronRight" size={15} className="shrink-0 text-design-secondary" />
                </a>
              ))}
            </div>
          </section>
        ))}

        <p
          data-trace-id="m-settings-footnote"
          data-trace-source={SOURCE}
          className="px-1 pb-6 text-center text-xs text-design-muted"
        >
          Workspace settings apply to everyone in Nighthawk Labs.
        </p>
      </div>
    </main>
  );
}
