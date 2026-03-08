export interface ChannelChangeEventMapper {
  channelId: string;
  action: string;
}

export interface ChannelMapper {
  id: string;
  serverId: string;
  name: string;
  type: string;
  workspacesEnabled: boolean;
  teamIds: string[];
  baseBranch: string | null;
  githubUrl: string | null;
  defaultRepoPath: string | null;
  defaultSetupScript: string | null;
  defaultRunScript: string | null;
  defaultTeardownScript: string | null;
  orchestrateMode: boolean;
  createdAt: Date;
  updatedAt: Date;
}
