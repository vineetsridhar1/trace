export interface ChannelMapper {
  id: string;
  serverId: string;
  name: string;
  baseBranch: string | null;
  githubUrl: string | null;
  defaultRepoPath: string | null;
  defaultSetupScript: string | null;
  defaultRunScript: string | null;
  createdAt: Date;
  updatedAt: Date;
}
