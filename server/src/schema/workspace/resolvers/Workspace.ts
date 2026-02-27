import type { WorkspaceResolvers } from './../../types.generated';

export const Workspace: WorkspaceResolvers = {
  sessionCount: (parent, _arg, _ctx) => {
    return parent._count.sessions;
  },
  user: (parent, _arg, _ctx) => {
    return parent.user ?? null;
  },
  queuedRunConfig: async (_parent, _arg, _ctx) => { /* Workspace.queuedRunConfig resolver is required because Workspace.queuedRunConfig exists but WorkspaceMapper.queuedRunConfig does not */ }
};
