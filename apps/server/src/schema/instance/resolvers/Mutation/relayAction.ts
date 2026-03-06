import type { MutationResolvers } from './../../../types.generated';
import { requireAuth } from '../../../../lib/requireAuth';
import { getInstanceById } from '../../../../services/instanceService';
import { instanceRelay } from '../../../../services/instanceRelay';
import { authorizedSessions } from './connectToInstance';

// Per-action timeout mapping (ms). Actions not listed here are rejected.
const ACTION_TIMEOUTS: Record<string, number> = {
  // Fast operations (30s)
  stopAgent: 30_000,
  detectAgents: 30_000,
  reportAgentActivity: 30_000,
  checkWorktreeExists: 30_000,
  getWorktreeBranch: 30_000,
  getWorktreeDiff: 30_000,
  listRepoBranches: 30_000,
  checkGhAuth: 30_000,
  listRepoFiles: 30_000,
  validateRepo: 30_000,
  listSlashCommands: 30_000,
  readProductDocFile: 30_000,
  writeProductDocFile: 30_000,
  getLocalConfig: 30_000,
  setLocalConfig: 30_000,
  getAllLocalConfigs: 30_000,
  deleteLocalConfig: 30_000,
  getGlobalConfig: 30_000,
  setGlobalConfig: 30_000,
  allocatePorts: 30_000,
  releasePorts: 30_000,
  checkRunningProcesses: 30_000,
  detectInstalledApps: 30_000,
  openInApp: 30_000,

  // Git write operations (60s)
  deleteWorktree: 60_000,
  mergeWorktree: 60_000,
  commitWorktreeChanges: 60_000,
  createGitBranch: 60_000,

  // Network operations (90s)
  checkBranchesMerged: 90_000,
  checkMainStatus: 90_000,
  pullMain: 90_000,
  pushWorktreeBranch: 90_000,
  ensureWorktreeFromRemote: 90_000,
  checkPRStatusesLocal: 90_000,
  checkPRCILocal: 90_000,
  listPullRequests: 90_000,
  checkoutPullRequest: 90_000,
  suggestScripts: 90_000,

  // Spawn (120s)
  spawnAgent: 120_000,
};

const ALLOWED_ACTIONS = new Set(Object.keys(ACTION_TIMEOUTS));

export const relayAction: NonNullable<MutationResolvers['relayAction']> = async (_parent, { instanceId, action, params }, ctx) => {
  const user = requireAuth(ctx);

  if (!ALLOWED_ACTIONS.has(action)) {
    return { success: false, error: 'INVALID_ACTION' };
  }

  const inst = await getInstanceById(instanceId);
  if (!inst) {
    return { success: false, error: 'INSTANCE_NOT_FOUND' };
  }

  if (inst.userId !== user.id && !authorizedSessions.has(`${user.id}:${inst.id}`)) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  if (!instanceRelay.isOnline(instanceId)) {
    return { success: false, error: 'INSTANCE_OFFLINE' };
  }

  try {
    const timeoutMs = ACTION_TIMEOUTS[action] ?? 30_000;
    const result = await instanceRelay.sendCommand(instanceId, action, params as Record<string, unknown>, timeoutMs);
    return { success: result.success, data: result.data, error: result.error };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'RELAY_ERROR';
    return { success: false, error: message };
  }
};
