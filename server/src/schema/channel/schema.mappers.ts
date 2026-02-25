export interface ChannelMapper {
  id: string;
  serverId: string;
  name: string;
  baseBranch: string | null;
  githubUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RepoValidationMapper {
  valid: boolean;
  originUrl?: string | null;
  error?: string | null;
}
