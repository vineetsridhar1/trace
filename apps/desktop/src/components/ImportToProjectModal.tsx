import { useState, useCallback, useMemo } from 'react';
import { gql } from '@apollo/client';
import { FiX, FiZap } from 'react-icons/fi';
import { Spinner } from './Spinner';
import { ModelEffortSelector } from './ModelEffortSelector';
import { InteractionModeToggle } from './RunButtons';
import type { InteractionMode } from './RunButtons';
import { useAgentRunStore } from '../stores/agentRunStore';
import type { Channel, LocalChannelConfig } from '../types';
import {
  useCreateChannelForImportMutation,
  useImportTicketsToProjectMutation,
  useDeleteChannelForCleanupMutation,
} from './__generated__/ImportToProjectModal.generated';

const GQL_CREATE_CHANNEL_FOR_IMPORT = gql`
  mutation CreateChannelForImport(
    $name: String!
    $serverId: String
    $type: String
    $workspacesEnabled: Boolean
    $baseBranch: String
    $githubUrl: String
    $defaultSetupScript: String
    $defaultRunScript: String
  ) {
    createChannel(
      name: $name
      serverId: $serverId
      type: $type
      workspacesEnabled: $workspacesEnabled
      baseBranch: $baseBranch
      githubUrl: $githubUrl
      defaultSetupScript: $defaultSetupScript
      defaultRunScript: $defaultRunScript
    ) {
      id
      serverId
      name
      type
      workspacesEnabled
      baseBranch
      githubUrl
      defaultSetupScript
      defaultRunScript
      createdAt
      updatedAt
    }
  }
`;

const GQL_DELETE_CHANNEL_FOR_CLEANUP = gql`
  mutation DeleteChannelForCleanup($id: ID!) {
    deleteChannel(id: $id)
  }
`;

const GQL_IMPORT_TICKETS = gql`
  mutation ImportTicketsToProject(
    $channelId: ID!
    $tickets: [ImportTicketInput!]!
    $runConfig: JSON!
  ) {
    importTicketsToProject(
      channelId: $channelId
      tickets: $tickets
      runConfig: $runConfig
    ) {
      ticketJsonId
      workspaceId
      ticketId
    }
  }
`;

interface ImportToProjectModalProps {
  tickets: Array<{ id: string; title?: string; body: string; dependencies: string[] }>;
  sourceChannel: Channel;
  serverId: string;
  localConfig: LocalChannelConfig | null;
  scopingDocsPath: string | null;
  productDocBranch?: string | null;
  onClose: () => void;
  onImported: (channelId: string) => void;
  onLocalConfigSave: (channelId: string, data: LocalChannelConfig) => Promise<void>;
}

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function ImportToProjectModal({
  tickets,
  sourceChannel,
  serverId,
  localConfig,
  scopingDocsPath,
  productDocBranch,
  onClose,
  onImported,
  onLocalConfigSave,
}: ImportToProjectModalProps) {
  const [projectName, setProjectName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchEdited, setBranchEdited] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autonomous, setAutonomous] = useState(false);

  // Local copies so we don't mutate the global defaults when tweaking inside this modal
  const [agent, setAgent] = useState(() => useAgentRunStore.getState().selectedAgent);
  const [model, setModel] = useState(() => useAgentRunStore.getState().selectedModel);
  const [effort, setEffort] = useState(() => useAgentRunStore.getState().selectedEffort);
  const [mode, setMode] = useState<InteractionMode>('code');

  const [executeCreateChannel] = useCreateChannelForImportMutation();
  const [executeImportTickets] = useImportTicketsToProjectMutation();
  const [executeDeleteChannel] = useDeleteChannelForCleanupMutation();

  const repoPath = localConfig?.localRepoPath ?? '';

  const autoBranch = useMemo(() => {
    const kebab = toKebabCase(projectName);
    return kebab ? `project/${kebab}` : '';
  }, [projectName]);

  const effectiveBranch = branchEdited ? branchName : autoBranch;

  const handleProjectNameChange = useCallback((value: string) => {
    setProjectName(value);
    if (!branchEdited) {
      setBranchName('');
    }
  }, [branchEdited]);

  const handleImport = useCallback(async () => {
    const trimmedName = projectName.trim();
    const trimmedBranch = effectiveBranch.trim();
    if (!trimmedName || !trimmedBranch) return;

    setImporting(true);
    setError(null);

    try {
      // Step 1: Create git branch locally (with scoping docs committed)
      if (repoPath) {
        const baseBranch = sourceChannel.baseBranch || 'main';
        const branchResult = await window.traceAPI.createGitBranch(
          repoPath,
          trimmedBranch,
          baseBranch,
          scopingDocsPath ?? undefined,
          productDocBranch ?? undefined,
        );
        if (!branchResult.success) {
          setError(`Failed to create branch: ${branchResult.error}`);
          setImporting(false);
          return;
        }
      }

      // Step 2: Create project channel with baseBranch = new branch
      const { data: channelData, errors: channelErrors } = await executeCreateChannel({
        variables: {
          name: trimmedName,
          serverId,
          type: 'project',
          workspacesEnabled: true,
          baseBranch: trimmedBranch,
          githubUrl: sourceChannel.githubUrl,
          defaultSetupScript: sourceChannel.defaultSetupScript ?? null,
          defaultRunScript: sourceChannel.defaultRunScript ?? null,
        },
      });

      if (channelErrors?.length) {
        setError(channelErrors[0].message || 'Failed to create channel');
        setImporting(false);
        return;
      }

      const newChannel = channelData!.createChannel;

      try {
        // Step 3: Copy local config to new channel
        if (localConfig) {
          await onLocalConfigSave(newChannel.id, { ...localConfig });
        }

        // Step 4: Bulk import tickets
        const ticketInputs = tickets.map((t) => ({
          ticketJsonId: t.id,
          title: t.title || t.id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          body: t.body,
          dependencies: t.dependencies,
        }));

        const runConfig = {
          setupScript: sourceChannel.defaultSetupScript ?? localConfig?.setupScript ?? null,
          runScript: sourceChannel.defaultRunScript ?? localConfig?.runScript ?? null,
          ...(autonomous && {
            autonomous: true,
            model,
            effort,
            planMode: mode === 'plan',
          }),
        };

        const { data: importData, errors: importErrors } = await executeImportTickets({
          variables: {
            channelId: newChannel.id,
            tickets: ticketInputs,
            runConfig,
          },
        });

        if (importErrors?.length) {
          // Clean up the channel since ticket import failed
          await executeDeleteChannel({ variables: { id: newChannel.id } }).catch(() => {});
          setError(importErrors[0].message || 'Failed to import tickets');
          setImporting(false);
          return;
        }

        // Step 5: Navigate to new channel
        onImported(newChannel.id);

        // Step 6: If autonomous, trigger auto-runs for root tickets from the client.
        //         We use a short delay so the channel subscription is established first.
        if (autonomous && importData?.importTicketsToProject) {
          const rootTicketIds = new Set(
            tickets.filter((t) => t.dependencies.length === 0).map((t) => t.id),
          );
          const rootResults = importData.importTicketsToProject.filter((r) =>
            rootTicketIds.has(r.ticketJsonId),
          );
          const autoRunConfig = { model, effort, planMode: mode === 'plan' };

          setTimeout(() => {
            const { workspaceActions } = useAgentRunStore.getState();
            for (const r of rootResults) {
              const ticket = tickets.find((t) => t.id === r.ticketJsonId);
              if (!ticket) continue;
              void workspaceActions.autoRunQueuedTicket(r.workspaceId, {
                prompt: ticket.body,
                ...autoRunConfig,
              });
            }
          }, 2000);
        }
      } catch (innerErr) {
        // Clean up the channel on unexpected failure
        await executeDeleteChannel({ variables: { id: newChannel.id } }).catch(() => {});
        throw innerErr;
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setImporting(false);
    }
  }, [
    projectName,
    effectiveBranch,
    repoPath,
    sourceChannel,
    serverId,
    localConfig,
    productDocBranch,
    scopingDocsPath,
    tickets,
    autonomous,
    model,
    effort,
    mode,
    executeCreateChannel,
    executeImportTickets,
    executeDeleteChannel,
    onLocalConfigSave,
    onImported,
  ]);

  const canImport = projectName.trim() && effectiveBranch.trim() && !importing;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="w-[520px] max-h-[80vh] overflow-y-auto rounded-lg border border-edge bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="text-sm font-semibold text-primary">Import to Project</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary">
            <FiX className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-primary">
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => handleProjectNameChange(e.target.value)}
              placeholder="My Project"
              autoFocus
              className="w-full rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-primary placeholder-faint outline-none focus:border-edge-hover"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-primary">
              Branch Name
            </label>
            <input
              type="text"
              value={effectiveBranch}
              onChange={(e) => {
                setBranchName(e.target.value);
                setBranchEdited(true);
              }}
              placeholder="project/my-project"
              className="w-full rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-primary placeholder-faint outline-none focus:border-edge-hover font-mono"
            />
          </div>

          {/* Autonomous mode toggle */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setAutonomous((v) => !v)}
              className={`flex w-full items-center gap-2.5 rounded border px-3 py-2 text-left transition-colors ${
                autonomous
                  ? 'border-accent/40 bg-accent/10'
                  : 'border-edge bg-surface-deep hover:border-edge-hover'
              }`}
            >
              <FiZap className={`h-3.5 w-3.5 flex-shrink-0 ${autonomous ? 'text-accent-light' : 'text-muted'}`} />
              <div className="min-w-0 flex-1">
                <span className={`text-xs font-medium ${autonomous ? 'text-accent-light' : 'text-primary'}`}>
                  Autonomous mode
                </span>
                <p className="text-[11px] text-muted">
                  Auto-run tickets when dependencies are met
                </p>
              </div>
              <div
                className={`h-4 w-7 rounded-full transition-colors ${autonomous ? 'bg-accent' : 'bg-surface'} flex items-center border border-edge`}
              >
                <div
                  className={`h-3 w-3 rounded-full bg-primary shadow-sm transition-transform ${autonomous ? 'translate-x-3' : 'translate-x-0.5'}`}
                />
              </div>
            </button>

            {autonomous && (
              <div className="flex items-center gap-1.5 pl-1">
                <ModelEffortSelector
                  agent={agent}
                  model={model}
                  effort={effort}
                  onAgentChange={setAgent}
                  onModelChange={setModel}
                  onEffortChange={setEffort}
                />
                <InteractionModeToggle mode={mode} onCycle={() => {
                  const modes: InteractionMode[] = ['code', 'plan', 'ask'];
                  setMode(modes[(modes.indexOf(mode) + 1) % 3]);
                }} />
              </div>
            )}
          </div>

          {/* Info line */}
          <div className="rounded bg-surface-deep px-3 py-2 text-xs text-muted">
            {repoPath && (
              <p className="truncate">
                Repo: <span className="text-primary font-mono">{repoPath}</span>
              </p>
            )}
            <p className="mt-0.5">
              {tickets.length} ticket{tickets.length !== 1 ? 's' : ''} will be imported
              {' '}(base: <span className="font-mono">{sourceChannel.baseBranch || 'main'}</span>)
            </p>
          </div>

          {error && (
            <div className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-edge px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-muted hover:text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={!canImport}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {importing ? (
              <span className="flex items-center gap-1.5">
                <Spinner className="h-3 w-3" />
                Importing...
              </span>
            ) : (
              'Import'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
