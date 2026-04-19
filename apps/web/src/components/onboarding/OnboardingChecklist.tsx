import { Check, ChevronRight, Circle, GitBranch, Github, Key } from "lucide-react";
import { motion } from "framer-motion";
import { useUIStore, type UIState } from "../../stores/ui";
import type { OnboardingStatus } from "../../hooks/useOnboardingStatus";

type IconComponent = typeof Key;

interface ChecklistItem {
  key: string;
  title: string;
  description: string;
  done: boolean;
  icon: IconComponent;
  settingsTab: string;
}

interface Props {
  status: OnboardingStatus;
}

export function OnboardingChecklist({ status }: Props) {
  const setActivePage = useUIStore((s: UIState) => s.setActivePage);
  const setSettingsInitialTab = useUIStore((s: UIState) => s.setSettingsInitialTab);

  const items: ChecklistItem[] = [
    {
      key: "anthropic",
      title: "Add your Anthropic API key",
      description: "Required to power Claude Code sessions.",
      done: status.anthropicSet,
      icon: Key,
      settingsTab: "api-keys",
    },
    {
      key: "github",
      title: "Add a GitHub token",
      description: "Used for repository access in cloud sessions.",
      done: status.githubSet,
      icon: Github,
      settingsTab: "api-keys",
    },
    {
      key: "repo",
      title: "Connect a repository",
      description: "Link a codebase to your organization.",
      done: status.hasRepo,
      icon: GitBranch,
      settingsTab: "repositories",
    },
  ];

  function openSettings(tab: string) {
    setSettingsInitialTab(tab);
    setActivePage("settings");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Get set up</h2>
        <span className="text-xs text-muted-foreground">
          {status.completedCount} of {status.totalCount} complete
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <ChecklistRow
            key={item.key}
            item={item}
            onClick={() => openSettings(item.settingsTab)}
          />
        ))}
      </div>
    </div>
  );
}

function ChecklistRow({ item, onClick }: { item: ChecklistItem; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-deep p-4 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center">
        {item.done ? (
          <Check size={18} className="text-emerald-500" />
        ) : (
          <Circle size={18} className="text-muted-foreground" />
        )}
      </span>
      <Icon size={16} className="shrink-0 text-muted-foreground" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-foreground">{item.title}</span>
        <span className="block text-xs text-muted-foreground">{item.description}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
    </motion.button>
  );
}
