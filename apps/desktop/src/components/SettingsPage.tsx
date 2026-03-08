import { useState, useEffect, useCallback, useMemo } from "react";
import {
  FiArrowLeft,
  FiSettings,
  FiHash,
  FiFolder,
  FiExternalLink,
  FiTrash2,
  FiZap,
  FiLock,
} from "react-icons/fi";
import { useAppUIStore } from "../stores/appUIStore";
import { useThemeStore, type ThemeName } from "../stores/themeStore";
import { useChannelContext } from "../context/ChannelContext";
import { Tooltip } from "./Tooltip";
import { gitUrlsMatch } from "../utils/gitUrl";
import type { Channel, LocalChannelConfig } from "../types";
import {
  useMyInstancesQuery,
  useSetInstancePasswordMutation,
} from "../hooks/__generated__/useInstanceSettings.generated";

interface SettingsPageProps {
  onDeleteChannel: (channelId: string) => Promise<void>;
  onSaveChannelSettings: (
    channelId: string,
    channelData: {
      name?: string;
      workspacesEnabled?: boolean;
      teamIds?: string[];
      defaultSetupScript?: string | null;
      defaultRunScript?: string | null;
      defaultTeardownScript?: string | null;
      orchestrateMode?: boolean;
    },
    localConfig: LocalChannelConfig | null,
  ) => Promise<void>;
}

export function SettingsPage({
  onDeleteChannel,
  onSaveChannelSettings,
}: SettingsPageProps) {
  const settingsSection = useAppUIStore((s) => s.settingsSection);
  const {
    enrichedChannels,
    getLocalConfig,
    localConfigs,
    activeServerId,
  } = useChannelContext();

  const serverChannels = useMemo(
    () => enrichedChannels.filter((ch) => ch.serverId === activeServerId),
    [enrichedChannels, activeServerId],
  );

  const joinedChannels = useMemo(
    () => serverChannels.filter((ch) => localConfigs[ch.id]),
    [serverChannels, localConfigs],
  );

  const handleClose = useCallback(() => {
    useAppUIStore.getState().closeSettings();
  }, []);

  const handleSelectSection = useCallback((section: string) => {
    useAppUIStore.getState().setSettingsSection(section);
  }, []);

  const selectedChannel = useMemo(
    () =>
      settingsSection !== "trace"
        ? serverChannels.find((ch) => ch.id === settingsSection) ?? null
        : null,
    [serverChannels, settingsSection],
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-edge px-4 py-3 drag-region">
        <button
          type="button"
          onClick={handleClose}
          className="flex items-center gap-2 rounded px-2 py-1 text-sm text-muted hover:bg-surface-elevated hover:text-primary transition-colors no-drag"
        >
          <FiArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h1 className="text-sm font-semibold text-primary">Settings</h1>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar */}
        <div className="w-52 shrink-0 border-r border-edge overflow-y-auto py-3 px-2">
          {/* Trace Settings */}
          <button
            type="button"
            onClick={() => handleSelectSection("trace")}
            className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              settingsSection === "trace"
                ? "bg-surface-elevated text-primary"
                : "text-muted hover:bg-surface-elevated hover:text-primary"
            }`}
          >
            <FiSettings className="h-3.5 w-3.5 shrink-0" />
            Trace
          </button>

          {/* Channel Settings */}
          <div className="mt-4">
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-faint">
              Channels
            </p>
            {joinedChannels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => handleSelectSection(ch.id)}
                className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-xs transition-colors ${
                  settingsSection === ch.id
                    ? "bg-surface-elevated text-primary font-medium"
                    : "text-muted hover:bg-surface-elevated hover:text-primary"
                }`}
              >
                <FiHash className="h-3 w-3 shrink-0" />
                <span className="truncate">{ch.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-xl px-8 py-6">
            {settingsSection === "trace" ? (
              <TraceSettingsSection />
            ) : selectedChannel ? (
              <ChannelSettingsSection
                key={selectedChannel.id}
                channel={selectedChannel}
                teams={serverChannels.filter((ch) => ch.type === "team")}
                localConfig={getLocalConfig(selectedChannel.id)}
                onSave={(channelData, localCfg) =>
                  onSaveChannelSettings(selectedChannel.id, channelData, localCfg)
                }
                onDelete={() => onDeleteChannel(selectedChannel.id)}
              />
            ) : (
              <div className="text-sm text-muted">
                Select a section from the sidebar
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Trace Settings Section ──────────────────────────────────────────

function TraceSettingsSection() {
  const { activeServerId } = useChannelContext();
  const { data, refetch } = useMyInstancesQuery();
  const [setInstancePasswordMutation] = useSetInstancePasswordMutation();

  const instance = useMemo(
    () => data?.myInstances.find((i) => i.serverId === activeServerId) ?? null,
    [data, activeServerId],
  );

  const [instanceName, setInstanceName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // App settings
  const [draftTerminalFont, setDraftTerminalFont] = useState("");

  useEffect(() => {
    void window.traceAPI.instanceGetName().then(setInstanceName);
  }, []);

  useEffect(() => {
    window.traceAPI
      .getGlobalConfig()
      .then((cfg) => setDraftTerminalFont(cfg.terminalFontFamily ?? ""))
      .catch((): void => {});
  }, []);

  const handleSaveName = useCallback(async () => {
    if (!instanceName.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await window.traceAPI.instanceSetName(instanceName.trim());
      setSuccess("Instance name updated.");
    } catch {
      setError("Failed to update instance name.");
    } finally {
      setSaving(false);
    }
  }, [instanceName]);

  const handleSetPassword = useCallback(async () => {
    if (!password.trim() || !instance) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const { data: result } = await setInstancePasswordMutation({
        variables: { instanceId: instance.id, password: password.trim() },
      });
      if (!result?.setInstancePassword) {
        setError("Failed to set password.");
      } else {
        setPassword("");
        setSuccess("Password set. Other users will need it to connect.");
        void refetch();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set password.");
    } finally {
      setSaving(false);
    }
  }, [password, instance, setInstancePasswordMutation, refetch]);

  const handleRemovePassword = useCallback(async () => {
    if (!instance) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const { data: result } = await setInstancePasswordMutation({
        variables: { instanceId: instance.id, password: null },
      });
      if (!result?.setInstancePassword) {
        setError("Failed to remove password.");
      } else {
        setSuccess("Password removed. Anyone can connect now.");
        void refetch();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove password.",
      );
    } finally {
      setSaving(false);
    }
  }, [instance, setInstancePasswordMutation, refetch]);

  const handleSaveTerminalFont = useCallback(async () => {
    try {
      await window.traceAPI.setGlobalConfig({
        terminalFontFamily: draftTerminalFont.trim() || undefined,
      });
      setSuccess("Terminal font saved.");
    } catch {
      setError("Failed to save terminal font.");
    }
  }, [draftTerminalFont]);

  const hasPassword = instance?.hasPassword ?? false;

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-primary">Trace Settings</h2>

      {/* Appearance */}
      <ThemeSelector />

      <div className="border-t border-edge" />

      {/* Instance Name */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">
          Instance
        </h3>
        <label className="mb-1.5 block text-xs font-medium text-muted">
          Instance Name
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            className="flex-1 rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-primary placeholder-faint outline-none focus:border-edge-hover"
            placeholder="My Machine"
          />
          <button
            type="button"
            disabled={saving || !instanceName.trim()}
            onClick={() => void handleSaveName()}
            className="btn-primary rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      {/* Password */}
      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
          <FiLock className="h-3 w-3" />
          Connection Password
        </label>
        <p className="mb-2 text-xs text-muted">
          {hasPassword
            ? "A password is set. Other users must enter it to connect to this instance."
            : "No password set. Set one to require authentication from other users."}
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
              setSuccess(null);
            }}
            className="flex-1 rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-primary placeholder-faint outline-none focus:border-edge-hover"
            placeholder={hasPassword ? "New password" : "Set a password"}
          />
          <button
            type="button"
            disabled={saving || !password.trim() || !instance}
            onClick={() => void handleSetPassword()}
            className="btn-primary rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {hasPassword ? "Update" : "Set"}
          </button>
        </div>
        {hasPassword && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleRemovePassword()}
            className="mt-2 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
          >
            Remove password
          </button>
        )}
      </div>

      <div className="border-t border-edge" />

      {/* App Settings */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">
          App Settings
        </h3>
        <div>
          <div className="mb-2">
            <label className="text-xs font-medium text-primary">
              Terminal Font
            </label>
            <p className="text-xs text-muted">
              CSS font-family for the terminal. Leave blank for default.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={draftTerminalFont}
              onChange={(e) => setDraftTerminalFont(e.target.value)}
              placeholder='"MesloLGS NF", "Hack Nerd Font Mono", Menlo, monospace'
              className="flex-1 rounded border border-edge bg-surface-deep px-3 py-1.5 text-xs text-primary placeholder-faint outline-none focus:border-edge-hover font-mono"
            />
            <button
              type="button"
              onClick={() => void handleSaveTerminalFont()}
              className="btn-primary rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Feedback */}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-green-400">{success}</p>}
    </div>
  );
}

// ─── Channel Settings Section ────────────────────────────────────────

interface ChannelSettingsSectionProps {
  channel: Channel;
  teams: Channel[];
  localConfig: LocalChannelConfig | null;
  onSave: (
    channelData: {
      name?: string;
      workspacesEnabled?: boolean;
      teamIds?: string[];
      defaultSetupScript?: string | null;
      defaultRunScript?: string | null;
      defaultTeardownScript?: string | null;
      orchestrateMode?: boolean;
    },
    localConfig: LocalChannelConfig | null,
  ) => Promise<void>;
  onDelete: () => Promise<void>;
}

function ChannelSettingsSection({
  channel,
  teams,
  localConfig,
  onSave,
  onDelete,
}: ChannelSettingsSectionProps) {
  // Channel settings
  const [draftName, setDraftName] = useState(channel.name);
  const [draftWorkspacesEnabled, setDraftWorkspacesEnabled] = useState(
    channel.workspacesEnabled,
  );
  const [draftTeamIds, setDraftTeamIds] = useState<string[]>(
    channel.teamIds ?? [],
  );
  const [teamsDropdownOpen, setTeamsDropdownOpen] = useState(false);
  const [draftDefaultSetupScript, setDraftDefaultSetupScript] = useState(
    channel.defaultSetupScript ?? "",
  );
  const [draftDefaultRunScript, setDraftDefaultRunScript] = useState(
    channel.defaultRunScript ?? "",
  );
  const [draftDefaultTeardownScript, setDraftDefaultTeardownScript] = useState(
    channel.defaultTeardownScript ?? "",
  );
  const [draftOrchestrateMode, setDraftOrchestrateMode] = useState(
    channel.orchestrateMode ?? false,
  );

  // User settings (local config)
  const [draftLocalRepoPath, setDraftLocalRepoPath] = useState(
    localConfig?.localRepoPath ?? "",
  );
  const [draftSetupScript, setDraftSetupScript] = useState(
    localConfig?.setupScript ?? "",
  );
  const [draftRunScript, setDraftRunScript] = useState(
    localConfig?.runScript ?? "",
  );
  const [draftTeardownScript, setDraftTeardownScript] = useState(
    localConfig?.teardownScript ?? "",
  );
  const [draftSystemInstructions, setDraftSystemInstructions] = useState(
    localConfig?.systemInstructions ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);

  const repoPath = draftLocalRepoPath || channel.localRepoPath || null;

  const handleSelectFolder = useCallback(async () => {
    const result = await window.traceAPI.selectFolder();
    if (!result.success || result.canceled || !result.path) return;

    const selectedPath = result.path;
    setRepoError(null);
    setValidating(true);

    try {
      const validateResult = await window.traceAPI.validateRepo(selectedPath);
      if (!validateResult.valid) {
        setRepoError(validateResult.error ?? "Invalid repository");
        return;
      }

      if (channel.githubUrl && validateResult.originUrl) {
        if (!gitUrlsMatch(channel.githubUrl, validateResult.originUrl)) {
          setRepoError(
            "This folder's git remote doesn't match the channel's repository",
          );
          return;
        }
      }

      setDraftLocalRepoPath(selectedPath);
    } catch {
      setRepoError("Failed to validate path");
    } finally {
      setValidating(false);
    }
  }, [channel.githubUrl]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const channelData: {
        name?: string;
        workspacesEnabled?: boolean;
        teamIds?: string[];
        defaultSetupScript?: string | null;
        defaultRunScript?: string | null;
        defaultTeardownScript?: string | null;
        orchestrateMode?: boolean;
      } = {
        name: draftName.trim() || undefined,
        workspacesEnabled: draftWorkspacesEnabled,
        defaultSetupScript: draftDefaultSetupScript.trim() || null,
        defaultRunScript: draftDefaultRunScript.trim() || null,
        defaultTeardownScript: draftDefaultTeardownScript.trim() || null,
        orchestrateMode: draftOrchestrateMode,
      };
      if (channel.type === "project") {
        channelData.teamIds = draftTeamIds;
      }

      let updatedLocalConfig: LocalChannelConfig | null = null;
      if (draftLocalRepoPath) {
        updatedLocalConfig = {
          localRepoPath: draftLocalRepoPath,
          setupScript: draftSetupScript.trim() || undefined,
          runScript: draftRunScript.trim() || undefined,
          teardownScript: draftTeardownScript.trim() || undefined,
          systemInstructions: draftSystemInstructions.trim() || undefined,
        };
      }

      await onSave(channelData, updatedLocalConfig);
    } catch (err) {
      console.error("[ChannelSettings] Save failed:", err);
    } finally {
      setSaving(false);
    }
  }, [
    channel.type,
    draftName,
    draftWorkspacesEnabled,
    draftTeamIds,
    draftDefaultSetupScript,
    draftDefaultRunScript,
    draftDefaultTeardownScript,
    draftOrchestrateMode,
    draftLocalRepoPath,
    draftSetupScript,
    draftRunScript,
    draftTeardownScript,
    draftSystemInstructions,
    onSave,
  ]);

  const handleSuggestScripts = useCallback(async () => {
    if (!repoPath) return;
    setSuggesting(true);
    try {
      const result = await window.traceAPI.suggestScripts(repoPath);
      if (result.success) {
        if (result.setupScript) setDraftDefaultSetupScript(result.setupScript);
        if (result.runScript) setDraftDefaultRunScript(result.runScript);
      }
    } catch (err) {
      console.error("[SuggestScripts] Error:", err);
    } finally {
      setSuggesting(false);
    }
  }, [repoPath]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await onDelete();
      useAppUIStore.getState().setSettingsSection("trace");
    } catch (err) {
      console.error("[ChannelSettings] Delete failed:", err);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [onDelete]);

  const textareaClass =
    "w-full rounded border border-edge bg-surface-deep px-3 py-1.5 text-xs text-primary placeholder-faint outline-none focus:border-edge-hover resize-none font-mono";

  const typeLabel =
    channel.type === "team"
      ? "Team"
      : channel.type === "project"
        ? "Project"
        : "Channel";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-primary">
          {typeLabel} Settings — #{channel.name}
        </h2>
      </div>

      {/* ═══ General Settings ═══ */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">
          {typeLabel} Settings
        </h3>

        {/* Name */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-primary">
            Name
          </label>
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="w-full rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-primary placeholder-faint outline-none focus:border-edge-hover"
          />
        </div>

        {/* Associated Teams (projects only) */}
        {channel.type === "project" && (
          <div className="relative mb-4">
            <label className="mb-1.5 block text-xs font-medium text-primary">
              Teams
            </label>
            {teams.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setTeamsDropdownOpen((o) => !o)}
                  className="flex w-full items-center justify-between rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-primary outline-none focus:border-edge-hover"
                >
                  <span
                    className={
                      draftTeamIds.length === 0 ? "text-[#404040]" : ""
                    }
                  >
                    {draftTeamIds.length === 0
                      ? "Select teams..."
                      : teams
                          .filter((t) => draftTeamIds.includes(t.id))
                          .map((t) => `# ${t.name}`)
                          .join(", ")}
                  </span>
                  <svg
                    className={`h-3 w-3 text-muted transition-transform ${teamsDropdownOpen ? "rotate-180" : ""}`}
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 4.5L6 7.5L9 4.5" />
                  </svg>
                </button>
                {teamsDropdownOpen && (
                  <div className="absolute left-0 right-0 z-10 mt-1 max-h-40 overflow-y-auto rounded border border-edge bg-surface-deep py-1 shadow-lg">
                    {teams.map((team) => {
                      const selected = draftTeamIds.includes(team.id);
                      return (
                        <button
                          key={team.id}
                          type="button"
                          onClick={() =>
                            setDraftTeamIds((prev) =>
                              selected
                                ? prev.filter((tid) => tid !== team.id)
                                : [...prev, team.id],
                            )
                          }
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-primary hover:bg-surface-elevated"
                        >
                          <span
                            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                              selected
                                ? "border-accent bg-accent"
                                : "border-muted"
                            }`}
                          >
                            {selected && (
                              <svg
                                className="h-2.5 w-2.5 text-on-accent"
                                viewBox="0 0 12 12"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M2.5 6L5 8.5L9.5 3.5" />
                              </svg>
                            )}
                          </span>
                          <span># {team.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs italic text-muted">
                No teams yet — create a team first to associate it
              </p>
            )}
            <p className="mt-1.5 text-xs text-muted">
              Optional — associate this project with one or more teams
            </p>
          </div>
        )}

        {/* Workspaces toggle (hidden for chat-only channels) */}
        {channel.type !== "channel" && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <label className="text-xs font-medium text-primary">
                  Enable Workspaces
                </label>
                <p className="text-xs text-muted">
                  Link a repo to run code in isolated worktrees
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraftWorkspacesEnabled(!draftWorkspacesEnabled)
                }
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  draftWorkspacesEnabled
                    ? "bg-accent"
                    : "bg-surface-elevated"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    draftWorkspacesEnabled
                      ? "translate-x-4"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Orchestrate mode toggle */}
            {draftWorkspacesEnabled && (
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <label className="text-xs font-medium text-primary">
                    Orchestrate Mode
                  </label>
                  <p className="text-xs text-muted">
                    Auto-create an orchestrator to manage all tasks
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDraftOrchestrateMode(!draftOrchestrateMode)
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    draftOrchestrateMode
                      ? "bg-accent"
                      : "bg-surface-elevated"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      draftOrchestrateMode
                        ? "translate-x-4"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            )}

            {/* Repository section */}
            {draftWorkspacesEnabled && (
              <>
                {/* Repository path */}
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-medium text-primary">
                    Repository
                  </label>
                  {repoPath ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-muted truncate">
                        {repoPath}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDraftLocalRepoPath("");
                          setRepoError(null);
                        }}
                        className="shrink-0 rounded px-2 py-1.5 text-xs text-muted hover:bg-surface-elevated hover:text-primary"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleSelectFolder()}
                      disabled={validating}
                      className="w-full rounded border border-dashed border-edge bg-surface-deep px-3 py-3 text-sm text-muted hover:border-accent hover:text-primary disabled:opacity-50"
                    >
                      {validating ? "Validating..." : "Select Folder"}
                    </button>
                  )}
                  {repoError && (
                    <p className="mt-1 text-xs text-red-400">{repoError}</p>
                  )}
                </div>

                {/* GitHub link (read-only) */}
                {channel.githubUrl && (
                  <div className="mb-4">
                    <label className="mb-1.5 block text-xs font-medium text-primary">
                      GitHub
                    </label>
                    <a
                      href={channel.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                    >
                      {channel.githubUrl.replace(
                        /^https?:\/\/(www\.)?github\.com\//,
                        "",
                      )}
                      <FiExternalLink
                        className="h-3 w-3"
                        aria-hidden="true"
                      />
                    </a>
                  </div>
                )}

                {/* Everything below only shown when a repo is linked */}
                {repoPath && (
                  <>
                    {/* Base Branch (read-only) */}
                    <div className="mb-4">
                      <label className="mb-1.5 block text-xs font-medium text-primary">
                        Base Branch
                      </label>
                      <div className="w-full rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-muted">
                        {channel.baseBranch || "main"}
                      </div>
                    </div>

                    {/* Environment Variables (read-only reference) */}
                    <div className="mb-4">
                      <p className="mb-1.5 text-xs font-medium text-primary">
                        Available environment variables
                      </p>
                      <div className="rounded border border-edge bg-surface-deep px-3 py-2 space-y-0.5 text-xs text-muted">
                        <p>
                          <code className="text-green-400">$PORT</code> —
                          primary port (same as $TRACE_PORT_0)
                        </p>
                        <p>
                          <code className="text-green-400">
                            $TRACE_PORT_0
                          </code>{" "}
                          –{" "}
                          <code className="text-green-400">
                            $TRACE_PORT_9
                          </code>{" "}
                          — 10 allocated ports
                        </p>
                        <p>
                          <code className="text-green-400">
                            $REPO_FOLDER
                          </code>{" "}
                          — worktree directory path
                        </p>
                      </div>
                    </div>

                    {/* Default Setup Script */}
                    <div className="mb-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div>
                          <label className="text-xs font-medium text-primary">
                            Default Setup Script
                          </label>
                          <p className="text-xs text-muted">
                            Runs when a new workspace is created
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleSuggestScripts()}
                          disabled={suggesting}
                          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-accent hover:bg-surface-elevated disabled:opacity-50"
                        >
                          <FiZap className="h-3 w-3" aria-hidden="true" />
                          {suggesting ? "Analyzing..." : "Suggest Scripts"}
                        </button>
                      </div>
                      <textarea
                        value={draftDefaultSetupScript}
                        onChange={(e) =>
                          setDraftDefaultSetupScript(e.target.value)
                        }
                        placeholder={"e.g. cp ../.env .env\nnpm install"}
                        rows={3}
                        style={
                          { fieldSizing: "content" } as React.CSSProperties
                        }
                        className={textareaClass}
                      />
                    </div>

                    {/* Default Run Script */}
                    <div className="mb-4">
                      <div className="mb-2">
                        <label className="text-xs font-medium text-primary">
                          Default Run Script
                        </label>
                        <p className="text-xs text-muted">
                          Runs when you click the play button
                        </p>
                      </div>
                      <textarea
                        value={draftDefaultRunScript}
                        onChange={(e) =>
                          setDraftDefaultRunScript(e.target.value)
                        }
                        placeholder={"e.g. npm run dev"}
                        rows={2}
                        style={
                          { fieldSizing: "content" } as React.CSSProperties
                        }
                        className={textareaClass}
                      />
                    </div>

                    {/* Default Teardown Script */}
                    <div>
                      <div className="mb-2">
                        <label className="text-xs font-medium text-primary">
                          Default Teardown Script
                        </label>
                        <p className="text-xs text-muted">
                          Runs when a workspace worktree is deleted
                        </p>
                      </div>
                      <textarea
                        value={draftDefaultTeardownScript}
                        onChange={(e) =>
                          setDraftDefaultTeardownScript(e.target.value)
                        }
                        placeholder={
                          "e.g. docker compose down\nkill-port $PORT"
                        }
                        rows={2}
                        style={
                          { fieldSizing: "content" } as React.CSSProperties
                        }
                        className={textareaClass}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ═══ My Settings ═══ (only when repo linked) */}
      {channel.type !== "channel" && draftWorkspacesEnabled && repoPath && (
        <>
          <div className="border-t border-edge" />
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">
              My Settings
            </h3>

            {/* Local Repo Path (read-only) */}
            {localConfig?.localRepoPath && (
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-primary">
                  Local Repo Path
                </label>
                <div className="w-full rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-muted">
                  {localConfig.localRepoPath}
                </div>
              </div>
            )}

            {/* Setup Script Override */}
            <div className="mb-4">
              <div className="mb-2">
                <label className="text-xs font-medium text-primary">
                  Setup Script Override
                </label>
                <p className="text-xs text-muted">
                  Runs when a new workspace is created and will override the
                  default setup script
                </p>
              </div>
              <textarea
                value={draftSetupScript}
                onChange={(e) => setDraftSetupScript(e.target.value)}
                placeholder={
                  channel.defaultSetupScript ||
                  "e.g. cp ../.env .env\nnpm install"
                }
                rows={3}
                style={{ fieldSizing: "content" } as React.CSSProperties}
                className={textareaClass}
              />
            </div>

            {/* Run Script Override */}
            <div className="mb-4">
              <div className="mb-2">
                <label className="text-xs font-medium text-primary">
                  Run Script Override
                </label>
                <p className="text-xs text-muted">
                  Runs when you click the play button and will override the
                  default run script
                </p>
              </div>
              <textarea
                value={draftRunScript}
                onChange={(e) => setDraftRunScript(e.target.value)}
                placeholder={channel.defaultRunScript || "e.g. npm run dev"}
                rows={2}
                style={{ fieldSizing: "content" } as React.CSSProperties}
                className={textareaClass}
              />
            </div>

            {/* Teardown Script Override */}
            <div className="mb-4">
              <div className="mb-2">
                <label className="text-xs font-medium text-primary">
                  Teardown Script Override
                </label>
                <p className="text-xs text-muted">
                  Runs when a workspace worktree is deleted and will
                  override the default teardown script
                </p>
              </div>
              <textarea
                value={draftTeardownScript}
                onChange={(e) => setDraftTeardownScript(e.target.value)}
                placeholder={
                  channel.defaultTeardownScript ||
                  "e.g. docker compose down\nkill-port $PORT"
                }
                rows={2}
                style={{ fieldSizing: "content" } as React.CSSProperties}
                className={textareaClass}
              />
            </div>

            {/* System Instructions */}
            <div>
              <div className="mb-2">
                <label className="text-xs font-medium text-primary">
                  System Instructions
                </label>
                <p className="text-xs text-muted">
                  Injected as hidden context into every new task
                </p>
              </div>
              <textarea
                value={draftSystemInstructions}
                onChange={(e) => setDraftSystemInstructions(e.target.value)}
                placeholder={
                  "e.g. This is a TypeScript monorepo. Always run tests with `npm test` from the root."
                }
                rows={3}
                style={{ fieldSizing: "content" } as React.CSSProperties}
                className="w-full rounded border border-edge bg-surface-deep px-3 py-1.5 text-xs text-primary placeholder-faint outline-none focus:border-edge-hover resize-none"
              />
            </div>
          </div>
        </>
      )}

      {/* Footer actions */}
      <div className="flex items-center border-t border-edge pt-4">
        {/* Delete */}
        <div className="flex items-center gap-2">
          {confirmDelete ? (
            <>
              <span className="text-xs text-red-400">
                Delete this {typeLabel.toLowerCase()}?
              </span>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded bg-[#f7768e] px-2.5 py-1 text-xs font-medium text-on-accent hover:bg-[#ff9e9e] disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Confirm"}
              </button>
              {!deleting && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded px-2 py-1 text-xs text-muted hover:text-primary"
                >
                  Cancel
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted hover:bg-surface-elevated hover:text-red-400"
            >
              <FiTrash2 className="h-3 w-3" />
              Delete
            </button>
          )}
        </div>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="btn-primary rounded px-4 py-1.5 text-xs font-medium text-on-accent"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Theme Selector ──────────────────────────────────────────────────

const THEMES: { value: ThemeName; label: string }[] = [
  { value: "neutral", label: "Neutral" },
  { value: "tokyonight", label: "Tokyo Night" },
];

function ThemeSelector() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">
        Appearance
      </h3>
      <div className="flex gap-2">
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTheme(t.value)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              theme === t.value
                ? "border-accent bg-accent/20 text-accent-light"
                : "border-edge bg-surface-deep text-muted hover:border-edge-hover hover:text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
