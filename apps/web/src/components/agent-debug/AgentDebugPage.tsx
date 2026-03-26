import { useState } from "react";
import { ArrowLeft, Activity, DollarSign, Settings, List } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { Button } from "../ui/button";
import { ExecutionLogTab } from "./ExecutionLogTab";
import { CostDashboardTab } from "./CostDashboardTab";
import { AgentSettingsTab } from "./AgentSettingsTab";
import { WorkerStatusBar } from "./WorkerStatusBar";

type DebugTab = "executions" | "costs" | "settings";

const TABS: Array<{ id: DebugTab; label: string; icon: typeof Activity }> = [
  { id: "executions", label: "Execution Logs", icon: List },
  { id: "costs", label: "Cost Dashboard", icon: DollarSign },
  { id: "settings", label: "Settings", icon: Settings },
];

export function AgentDebugPage() {
  const setActivePage = useUIStore((s) => s.setActivePage);
  const [activeTab, setActiveTab] = useState<DebugTab>("executions");

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setActivePage("main")}
        >
          <ArrowLeft size={16} />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">Agent Debug Console</h1>
      </header>

      <WorkerStatusBar />

      <div className="flex shrink-0 border-b border-border px-4">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
                activeTab === tab.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "executions" && <ExecutionLogTab />}
        {activeTab === "costs" && <CostDashboardTab />}
        {activeTab === "settings" && <AgentSettingsTab />}
      </div>
    </div>
  );
}
