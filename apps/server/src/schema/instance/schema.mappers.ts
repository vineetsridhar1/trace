export interface ElectronInstanceMapper {
  id: string;
  userId: string;
  name: string;
  serverId: string;
  passwordHash: string | null;
  createdAt: Date;
}
