// _count.events → eventCount via Thread type resolver
export interface ThreadMapper {
  id: string;
  messageId: string;
  createdAt: Date;
  _count?: { events: number };
}
