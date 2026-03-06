export interface CliSessionMapper {
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

export interface CliSessionConnectionMapper {
  sessions: CliSessionMapper[];
  total: number;
  limit: number;
  offset: number;
}
