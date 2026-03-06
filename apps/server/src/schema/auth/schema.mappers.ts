export interface AuthUserMapper {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  githubUsername: string | null;
}
