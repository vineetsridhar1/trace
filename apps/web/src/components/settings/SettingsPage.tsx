import { useState } from "react";
import {
  ArrowLeft,
  GitBranch,
  Bot,
  SlidersHorizontal,
  Bell,
  Key,
  Users,
} from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { RepositoriesSection } from "./RepositoriesSection";
import { AgentSettingsSection } from "./AgentSettingsSection";
import { SessionDefaultsSection } from "./SessionDefaultsSection";
import { NotificationsSection } from "./NotificationsSection";
import { ApiTokensSection } from "./ApiTokensSection";
import { MembersSection } from "./MembersSection";

type SettingsTab =
  | "repositories"
  | "ai"
  | "session-defaults"
  | "notifications"
  | "api-keys"
  | "members";

const TABS: { id: SettingsTab; label: string; icon: typeof GitBranch }[] = [
  { id: "repositories", label: "Repositories", icon: GitBranch },
  { id: "members", label: "Members", icon: Users },
  { id: "ai", label: "AI Agent", icon: Bot },
  { id: "session-defaults", label: "Session Defaults", icon: SlidersHorizontal },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "api-keys", label: "API Keys", icon: Key },
];

export function SettingsPage() {
  const setActivePage = useUIStore((s) => s.setActivePage);
  const [activeTab, setActiveTab] = useState<SettingsTab>("repositories");

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setActivePage("main")}
        >
          <ArrowLeft size={16} />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <nav className="w-52 shrink-0 border-r border-border bg-surface-deep/50 p-3">
          <ul className="space-y-0.5">
            {TABS.map((tab) => (
              <li key={tab.id}>
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-2xl">
            {activeTab === "repositories" && <RepositoriesSection />}
            {activeTab === "members" && <MembersSection />}
            {activeTab === "ai" && <AgentSettingsSection />}
            {activeTab === "session-defaults" && <SessionDefaultsSection />}
            {activeTab === "notifications" && <NotificationsSection />}
            {activeTab === "api-keys" && <ApiTokensSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
