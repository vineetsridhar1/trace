import { toast } from "sonner";
import type { User } from "@trace/gql";
import { UPDATE_SESSION_DEFAULTS_MUTATION, useAuthStore, type AuthState } from "@trace/client-core";
import { client } from "../../lib/urql";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  getDefaultModel,
  getDefaultReasoningEffort,
  getModelLabel,
  getModelsForTool,
  getReasoningEffortLabel,
  getReasoningEffortsForTool,
} from "../session/modelOptions";

const TOOL_OPTIONS = [
  { value: "claude_code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "pi", label: "Pi" },
  { value: "antigravity", label: "Antigravity" },
] as const;

const TOOL_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  pi: "Pi",
  antigravity: "Antigravity",
};

type SessionDefaultsPatch = Pick<
  User,
  | "defaultSessionTool"
  | "defaultSessionModel"
  | "defaultSessionReasoningEffort"
  | "autoArchiveMergedSessions"
  | "enableClaudeInChrome"
>;

function updateAuthUser(patch: SessionDefaultsPatch) {
  useAuthStore.setState((state: AuthState) => ({
    user: state.user ? { ...state.user, ...patch } : state.user,
  }));
}

async function saveDefaults(input: {
  tool?: string | null;
  model?: string | null;
  reasoningEffort?: string | null;
  autoArchiveMergedSessions?: boolean;
  enableClaudeInChrome?: boolean;
}) {
  const result = await client.mutation(UPDATE_SESSION_DEFAULTS_MUTATION, { input }).toPromise();
  if (result.error) throw result.error;
  const user = result.data?.updateSessionDefaults as SessionDefaultsPatch | undefined;
  if (user) updateAuthUser(user);
}

export function SessionDefaultsSection() {
  const user = useAuthStore((s: AuthState) => s.user);
  const defaultTool = user?.defaultSessionTool ?? null;
  const defaultModel = user?.defaultSessionModel ?? null;
  const defaultReasoningEffort = user?.defaultSessionReasoningEffort ?? null;
  const autoArchiveMergedSessions = user?.autoArchiveMergedSessions ?? true;
  const enableClaudeInChrome = user?.enableClaudeInChrome ?? false;
  const effectiveTool = defaultTool ?? "claude_code";
  const effectiveModel = defaultModel ?? getDefaultModel(effectiveTool);
  const modelOptions = getModelsForTool(effectiveTool);
  const reasoningEffortOptions = getReasoningEffortsForTool(effectiveTool, effectiveModel);

  const handleToolChange = async (value: string | null) => {
    try {
      if (!value || value === "__none__") {
        await saveDefaults({ tool: null });
        return;
      }
      await saveDefaults({
        tool: value,
        model: getDefaultModel(value) ?? null,
        reasoningEffort: getDefaultReasoningEffort(value) ?? null,
      });
    } catch (error) {
      toast.error("Failed to update session defaults", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleModelChange = async (value: string | null) => {
    if (!defaultTool || !value || value === "__none__") return;
    try {
      await saveDefaults({
        tool: defaultTool,
        model: value,
        reasoningEffort: defaultReasoningEffort,
      });
    } catch (error) {
      toast.error("Failed to update session defaults", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleReasoningEffortChange = async (value: string | null) => {
    if (!defaultTool || !value || value === "__none__") return;
    try {
      await saveDefaults({
        tool: defaultTool,
        model: defaultModel,
        reasoningEffort: value,
      });
    } catch (error) {
      toast.error("Failed to update session defaults", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleAutoArchiveChange = async (value: string | null) => {
    if (value !== "yes" && value !== "no") return;
    try {
      await saveDefaults({ autoArchiveMergedSessions: value === "yes" });
    } catch (error) {
      toast.error("Failed to update session defaults", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleClaudeInChromeChange = async (value: string | null) => {
    if (value !== "yes" && value !== "no") return;
    try {
      await saveDefaults({ enableClaudeInChrome: value === "yes" });
    } catch (error) {
      toast.error("Failed to update session defaults", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Session Defaults</h2>
        <p className="text-sm text-muted-foreground">
          Set your preferred coding tool, model, and effort. New sessions use these defaults.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-surface-deep p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">
              Default Coding Tool
            </label>
            <Select value={defaultTool ?? "__none__"} onValueChange={handleToolChange}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {defaultTool ? (TOOL_LABELS[defaultTool] ?? defaultTool) : "None"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {TOOL_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">Default Model</label>
            <Select
              value={defaultModel ?? "__none__"}
              onValueChange={handleModelChange}
              disabled={!defaultTool}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {defaultModel
                    ? getModelLabel(defaultModel)
                    : defaultTool
                      ? "None"
                      : "Choose tool"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" disabled>
                  None
                </SelectItem>
                {modelOptions.map((m: { value: string; label: string }) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">Default Effort</label>
            <Select
              value={defaultReasoningEffort ?? "__none__"}
              onValueChange={handleReasoningEffortChange}
              disabled={!defaultTool}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {defaultReasoningEffort
                    ? getReasoningEffortLabel(defaultReasoningEffort)
                    : defaultTool
                      ? "None"
                      : "Choose tool"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" disabled>
                  None
                </SelectItem>
                {reasoningEffortOptions.map((effort: { value: string; label: string }) => (
                  <SelectItem key={effort.value} value={effort.value}>
                    {effort.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <label className="mb-1.5 block text-sm text-muted-foreground">
            Auto archive merged sessions
          </label>
          <Select
            value={autoArchiveMergedSessions ? "yes" : "no"}
            onValueChange={handleAutoArchiveChange}
          >
            <SelectTrigger className="w-full md:w-56">
              <SelectValue>{autoArchiveMergedSessions ? "Yes" : "No"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border-t border-border pt-4">
          <label className="mb-1.5 block text-sm text-muted-foreground">Claude in Chrome</label>
          <Select
            value={enableClaudeInChrome ? "yes" : "no"}
            onValueChange={handleClaudeInChromeChange}
          >
            <SelectTrigger className="w-full md:w-56">
              <SelectValue>{enableClaudeInChrome ? "Yes" : "No"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
