// channels omitted → forces Server.channels resolver
export interface ServerMapper {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}
