export interface SessionMapper {
  id: string;
  sessionId: string;
  transcriptPath: string | null;
  cwd: string | null;
  permissionMode: string | null;
  status: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  eventCount: number;
  toolSummary?: Record<string, number>;
}

export interface SessionConnectionMapper {
  sessions: SessionMapper[];
  total: number;
  limit: number;
  offset: number;
}
