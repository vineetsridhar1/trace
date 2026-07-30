import { cn } from "../../../lib/utils";
import type { RepoApplicationConfig } from "@trace/gql";
import type { AutomationSection } from "./useSessionAutomationDraft";

const SECTIONS: Array<{ id: AutomationSection; label: string }> = [
  { id: "setup", label: "Setup scripts" },
  { id: "run", label: "Run scripts" },
  { id: "apps", label: "Applications" },
];

export function SessionAutomationRail({
  active,
  config,
  issueSections,
  onChange,
}: {
  active: AutomationSection;
  config: RepoApplicationConfig;
  issueSections: AutomationSection[];
  onChange: (section: AutomationSection) => void;
}) {
  const configured: Record<AutomationSection, string[]> = {
    setup: config.setupScripts.map((script) => script.name || "Unnamed step"),
    run: config.runScripts.map((script) => script.name || "Unnamed script"),
    apps: config.applications.map((application) => application.name || "Unnamed application"),
  };

  return (
    <nav className="w-52 shrink-0 border-r border-border p-3" aria-label="Automation sections">
      <ul className="space-y-px">
        {SECTIONS.map((section) => {
          const isActive = active === section.id;
          return (
            <li key={section.id}>
              <button
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => onChange(section.id)}
                className={cn(
                  "relative block w-full rounded-lg px-2.5 py-2 text-left transition-colors",
                  isActive ? "bg-background" : "hover:bg-background/60",
                )}
              >
                {isActive ? (
                  <span className="absolute -left-3 top-2.5 h-5 w-0.5 rounded-full bg-primary" />
                ) : null}
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-[13px] text-foreground",
                      isActive && "font-medium",
                    )}
                  >
                    {section.label}
                  </span>
                  {issueSections.includes(section.id) ? (
                    <span
                      aria-label="Needs attention"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
                    />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block truncate text-[11px] leading-4",
                    configured[section.id].length
                      ? "text-muted-foreground"
                      : "italic text-muted-foreground/70",
                  )}
                >
                  {summarize(configured[section.id])}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function summarize(names: string[]): string {
  if (!names.length) return "Not configured";
  const visible = names.slice(0, 2).join(" · ");
  return names.length > 2 ? `${visible} +${names.length - 2}` : visible;
}
