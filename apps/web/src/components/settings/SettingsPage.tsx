import { useEffect, useMemo, useState } from "react";
import {
  GitBranch,
  SlidersHorizontal,
  Key,
  Users,
  Code,
  MonitorCog,
  ServerCog,
  KeyRound,
  Plug,
} from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { cn } from "../../lib/utils";
import { RepositoriesSection } from "./RepositoriesSection";
import { SessionDefaultsSection } from "./SessionDefaultsSection";
import { ApiTokensSection } from "./ApiTokensSection";
import { MembersSection } from "./MembersSection";
import { ChannelsSection } from "./ChannelsSection";
import { BridgeAccessSection } from "./BridgeAccessSection";
import { AgentEnvironmentsSection } from "./AgentEnvironmentsSection";
import { OrgSecretsSection } from "./OrgSecretsSection";
import { IntegrationsSection } from "./IntegrationsSection";
import { isLocalMode } from "../../lib/runtime-mode";

type SettingsTab =
  | "repositories"
  | "session-defaults"
  | "api-keys"
  | "members"
  | "channels"
  | "bridge-access"
  | "agent-environments"
  | "org-secrets"
  | "integrations";

const TABS: { id: SettingsTab; label: string; icon: typeof GitBranch }[] = [
  { id: "repositories", label: "Repositories", icon: GitBranch },
  { id: "members", label: "Members", icon: Users },
  { id: "session-defaults", label: "Session Defaults", icon: SlidersHorizontal },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "bridge-access", label: "Bridge Access", icon: MonitorCog },
  { id: "agent-environments", label: "Agent Environments", icon: ServerCog },
  { id: "org-secrets", label: "Org Secrets", icon: KeyRound },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "channels", label: "Channels", icon: Code },
];

const ALL_TAB_IDS: readonly SettingsTab[] = TABS.map((t) => t.id);

function isSettingsTab(value: string | null): value is SettingsTab {
  return value !== null && (ALL_TAB_IDS as readonly string[]).includes(value);
}

export function SettingsPage() {
  const settingsInitialTab = useUIStore((s) => s.settingsInitialTab);
  const setSettingsInitialTab = useUIStore((s) => s.setSettingsInitialTab);
  const [activeTab, setActiveTab] = useState<SettingsTab>("repositories");
  const visibleTabs = useMemo(
    () =>
      TABS.filter((tab) => {
        if (tab.id === "api-keys") return !isLocalMode;
        return true;
      }),
    [],
  );

  useEffect(() => {
    if (
      isSettingsTab(settingsInitialTab) &&
      visibleTabs.some((tab) => tab.id === settingsInitialTab)
    ) {
      setActiveTab(settingsInitialTab);
    }
    setSettingsInitialTab(null);
  }, [settingsInitialTab, setSettingsInitialTab, visibleTabs]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id ?? "repositories");
    }
  }, [activeTab, visibleTabs]);

  const contentWidthClass =
    activeTab === "members" ||
    activeTab === "repositories" ||
    activeTab === "channels" ||
    activeTab === "bridge-access" ||
    activeTab === "agent-environments" ||
    activeTab === "org-secrets" ||
    activeTab === "integrations"
      ? "mx-auto max-w-5xl"
      : "mx-auto max-w-2xl";

  return (
    <div className="flex h-full flex-col">
      <header className="app-region-drag flex h-12 shrink-0 items-center gap-2 border-b border-border py-0 pl-[var(--trace-header-title-offset)] pr-4 transition-[padding-left] duration-200 ease-in-out">
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav className="shrink-0 border-b border-border bg-surface-deep/50 p-3 md:w-52 md:border-b-0 md:border-r">
          <ul className="flex gap-1 overflow-x-auto md:block md:space-y-0.5">
            {visibleTabs.map((tab) => (
              <li key={tab.id}>
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
                    activeTab === tab.id
                      ? "bg-surface-elevated text-foreground font-medium"
                      : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                  )}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className={contentWidthClass}>
            {activeTab === "repositories" && <RepositoriesSection />}
            {activeTab === "members" && <MembersSection />}
            {activeTab === "session-defaults" && <SessionDefaultsSection />}
            {activeTab === "api-keys" && <ApiTokensSection />}
            {activeTab === "bridge-access" && <BridgeAccessSection />}
            {activeTab === "agent-environments" && <AgentEnvironmentsSection />}
            {activeTab === "org-secrets" && <OrgSecretsSection />}
            {activeTab === "integrations" && <IntegrationsSection />}
            {activeTab === "channels" && <ChannelsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
