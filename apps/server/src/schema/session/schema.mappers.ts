// _count.events → eventCount via Session type resolver
export interface SessionMapper {
  id: string;
  workspaceId: string;
  createdAt: Date;
  _count?: { events: number };
}
