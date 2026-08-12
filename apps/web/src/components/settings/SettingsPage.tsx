import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Cloud,
  GitBranch,
  Key,
  Laptop,
  Plug,
  Search,
  Shield,
  SlidersHorizontal,
  Users,
  Wrench,
} from "lucide-react";
import { useAuthStore, type AuthState, type OrgMembership } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import { cn, getInitials } from "../../lib/utils";
import { RepositoriesSection } from "./RepositoriesSection";
import { SessionDefaultsSection } from "./SessionDefaultsSection";
import { ApiTokensSection } from "./ApiTokensSection";
import { MembersSection } from "./MembersSection";
import { BridgeAccessSection } from "./BridgeAccessSection";
import { AgentEnvironmentsSection } from "./AgentEnvironmentsSection";
import { OrgSecretsSection } from "./OrgSecretsSection";
import { IntegrationsSection } from "./IntegrationsSection";
import { CodingToolsSection } from "./CodingToolsSection";
import { isLocalMode } from "../../lib/runtime-mode";

type SettingsTab =
  | "repositories"
  | "session-defaults"
  | "api-keys"
  | "members"
  | "bridge-access"
  | "agent-environments"
  | "org-secrets"
  | "integrations"
  | "coding-tools";

type Tab = {
  id: SettingsTab;
  label: string;
  icon: typeof GitBranch;
  group: "Workspace" | "Your account";
};

const TABS: readonly Tab[] = [
  { id: "members", label: "Members", icon: Users, group: "Workspace" },
  { id: "repositories", label: "Repositories", icon: GitBranch, group: "Workspace" },
  { id: "agent-environments", label: "Agent environments", icon: Cloud, group: "Workspace" },
  { id: "org-secrets", label: "Secrets", icon: Shield, group: "Workspace" },
  { id: "integrations", label: "Integrations", icon: Plug, group: "Workspace" },
  {
    id: "session-defaults",
    label: "Session defaults",
    icon: SlidersHorizontal,
    group: "Your account",
  },
  { id: "api-keys", label: "API keys", icon: Key, group: "Your account" },
  { id: "bridge-access", label: "Devices & access", icon: Laptop, group: "Your account" },
  { id: "coding-tools", label: "Coding tools", icon: Wrench, group: "Your account" },
];

const TAB_DETAILS: Record<SettingsTab, { title: string; description: string; wide?: boolean }> = {
  members: {
    title: "Members",
    description: "People with access to this workspace and their roles.",
    wide: true,
  },
  repositories: {
    title: "Repositories",
    description: "Codebases linked to this workspace, including their session automation.",
    wide: true,
  },
  "agent-environments": {
    title: "Agent environments",
    description: "Configure the local and cloud runtimes available to this workspace.",
    wide: true,
  },
  "org-secrets": {
    title: "Secrets",
    description: "Encrypted workspace values for launchers, runtimes, and shared server actions.",
    wide: true,
  },
  integrations: {
    title: "Integrations",
    description: "Connect workspace tools and control how they interact with Trace.",
    wide: true,
  },
  "session-defaults": {
    title: "Session defaults",
    description:
      "Your defaults for new coding sessions. You can change them for any individual session.",
  },
  "api-keys": {
    title: "API keys",
    description: "Personal credentials used by your coding tools and cloud sessions.",
    wide: true,
  },
  "bridge-access": {
    title: "Devices & access",
    description: "Review connected devices and approve access to your local bridge.",
    wide: true,
  },
  "coding-tools": {
    title: "Coding tools",
    description: "Install and update coding tools available to local sessions.",
    wide: true,
  },
};

function isSettingsTab(value: string | null): value is SettingsTab {
  return value !== null && TABS.some((tab) => tab.id === value);
}

export function SettingsPage() {
  const settingsInitialTab = useUIStore((s) => s.settingsInitialTab);
  const setSettingsInitialTab = useUIStore((s) => s.setSettingsInitialTab);
  const setActivePage = useUIStore((s) => s.setActivePage);
  const user = useAuthStore((s: AuthState) => s.user);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const memberships = useAuthStore((s: AuthState) => s.orgMemberships);
  const [activeTab, setActiveTab] = useState<SettingsTab>("repositories");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [query, setQuery] = useState("");
  const visibleTabs = useMemo(
    () => TABS.filter((tab) => tab.id !== "api-keys" || !isLocalMode),
    [],
  );
  const matchingTabs = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term
      ? visibleTabs.filter((tab) => tab.label.toLocaleLowerCase().includes(term))
      : visibleTabs;
  }, [query, visibleTabs]);
  const activeOrg = memberships.find(
    (membership: OrgMembership) => membership.organizationId === activeOrgId,
  )?.organization;
  const detail = TAB_DETAILS[activeTab];
  const isDesktopShell = typeof window.trace !== "undefined";

  useEffect(() => {
    if (
      isSettingsTab(settingsInitialTab) &&
      visibleTabs.some((tab) => tab.id === settingsInitialTab)
    ) {
      setActiveTab(settingsInitialTab);
      setMobileDetailOpen(true);
    }
    setSettingsInitialTab(null);
  }, [settingsInitialTab, setSettingsInitialTab, visibleTabs]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) setActiveTab("repositories");
  }, [activeTab, visibleTabs]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0a0a0c] text-foreground [--background:#0a0a0c] [--border:#27272d] [--card:#161619] [--foreground:#fafafa] [--input:#27272d] [--muted-foreground:#9d9da8] [--popover:#161619] [--primary-foreground:#0a0a0c] [--primary:#fafafa]">
      <header
        className={cn(
          "app-region-drag flex h-[52px] shrink-0 items-center justify-end border-b border-[#27272d] px-4 md:justify-between",
          isDesktopShell && "pl-[92px]",
        )}
      >
        <div className="hidden min-w-0 items-center gap-2.5 md:flex">
          <button
            type="button"
            onClick={() => setActivePage("main")}
            className="app-region-no-drag -ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Back to workspace"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="h-5 w-px shrink-0 bg-[#27272d]" />
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[11px] font-bold text-zinc-950">
            T
          </span>
          <span className="truncate text-[13px] font-medium text-zinc-100">
            {activeOrg?.name ?? "Workspace"}
          </span>
          <span className="text-zinc-600">/</span>
          <span className="text-[13px] text-zinc-400">Settings</span>
        </div>
        <div className="app-region-no-drag flex shrink-0 items-center gap-2.5">
          <span className="hidden text-xs text-zinc-400 sm:block">{user?.email}</span>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 text-[10px] font-semibold text-zinc-100">
            {getInitials(user?.name ?? user?.email ?? "You")}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div
          className={cn(
            "h-full w-full overflow-y-auto px-4 py-6 md:hidden",
            mobileDetailOpen && "hidden",
          )}
        >
          <div className="mx-auto max-w-lg">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-zinc-50">Settings</h1>
            <p className="mt-1 text-[13px] leading-5 text-zinc-400">
              Manage your workspace and personal preferences.
            </p>
            <div className="mt-6 space-y-6">
              {(["Workspace", "Your account"] as const).map((group) => (
                <section key={group}>
                  <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    {group}
                  </h2>
                  <div className="overflow-hidden rounded-xl border border-[#27272d] bg-[#161619]">
                    {visibleTabs
                      .filter((tab) => tab.group === group)
                      .map((tab) => {
                        const Icon = tab.icon;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => {
                              setActiveTab(tab.id);
                              setMobileDetailOpen(true);
                            }}
                            className="flex w-full items-center gap-3 border-b border-[#27272d] px-4 py-3.5 text-left last:border-b-0 active:bg-zinc-800"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#27272d] bg-[#0a0a0c] text-zinc-400">
                              <Icon size={15} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-medium text-zinc-100">
                                {tab.label}
                              </span>
                              <span className="mt-0.5 block text-xs leading-4 text-zinc-500">
                                {TAB_DETAILS[tab.id].description}
                              </span>
                            </span>
                            <ChevronRight size={15} className="shrink-0 text-zinc-600" />
                          </button>
                        );
                      })}
                  </div>
                </section>
              ))}
            </div>
            <p className="px-1 py-6 text-center text-xs text-zinc-500">
              Workspace settings apply to everyone in {activeOrg?.name ?? "this workspace"}.
            </p>
          </div>
        </div>

        <nav
          aria-label="Settings sections"
          className="hidden w-60 shrink-0 border-r border-[#27272d] px-3 py-4 md:block"
        >
          <label className="mb-3 flex h-8 items-center gap-2 rounded-lg border border-[#27272d] bg-[#161619] px-2.5 text-zinc-500 focus-within:border-zinc-500 md:mb-4">
            <Search size={13} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search settings"
              aria-label="Search settings"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500"
            />
          </label>
          <div className="space-y-5">
            {(["Workspace", "Your account"] as const).map((group) => {
              const tabs = matchingTabs.filter((tab) => tab.group === group);
              if (!tabs.length) return null;
              return (
                <div key={group}>
                  <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    {group}
                  </p>
                  <ul className="space-y-px">
                    {tabs.map((tab) => {
                      const Icon = tab.icon;
                      const selected = activeTab === tab.id;
                      return (
                        <li key={tab.id}>
                          <button
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                              "relative flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] whitespace-nowrap transition-colors",
                              selected
                                ? "bg-[#161619] font-medium text-zinc-50 before:absolute before:-left-3 before:h-5 before:w-0.5 before:rounded-full before:bg-zinc-100"
                                : "text-zinc-400 hover:bg-[#161619] hover:text-zinc-100",
                            )}
                          >
                            <Icon
                              size={15}
                              className={selected ? "text-zinc-100" : "text-zinc-500"}
                            />
                            {tab.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </nav>

        <main
          className={cn(
            "min-h-0 w-full flex-1 overflow-y-auto",
            mobileDetailOpen ? "block" : "hidden",
            "md:block",
          )}
        >
          <div
            className={cn(
              "mx-auto px-5 py-7 sm:px-8 md:px-10 md:py-8",
              detail.wide ? "max-w-[1000px]" : "max-w-[760px]",
            )}
          >
            <button
              type="button"
              onClick={() => setMobileDetailOpen(false)}
              className="mb-5 inline-flex items-center gap-2 text-[13px] font-medium text-zinc-400 transition-colors hover:text-zinc-100 md:hidden"
            >
              <ArrowLeft size={16} />
              Settings
            </button>
            <div className="settings-redesign-content">
              {activeTab === "repositories" && <RepositoriesSection />}
              {activeTab === "members" && <MembersSection />}
              {activeTab === "session-defaults" && <SessionDefaultsSection />}
              {activeTab === "api-keys" && <ApiTokensSection />}
              {activeTab === "bridge-access" && <BridgeAccessSection />}
              {activeTab === "agent-environments" && <AgentEnvironmentsSection />}
              {activeTab === "org-secrets" && <OrgSecretsSection />}
              {activeTab === "integrations" && <IntegrationsSection />}
              {activeTab === "coding-tools" && <CodingToolsSection />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
