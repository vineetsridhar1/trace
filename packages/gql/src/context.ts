import type { ActorType, UserRole } from "./generated/types";
import type DataLoader from "dataloader";

export interface Context {
  userId: string;
  /** Active organization ID — set from X-Organization-Id header. Null for org-less operations (e.g. DMs). */
  organizationId: string | null;
  /** Role in the active organization. Null when organizationId is null. */
  role: UserRole | null;
  actorType: ActorType;
  userLoader: DataLoader<string, { id: string; name: string | null; avatarUrl: string | null } | null>;
  sessionLoader: DataLoader<string, unknown | null>;
  sessionGroupLoader: DataLoader<string, unknown | null>;
  repoLoader: DataLoader<string, unknown | null>;
  eventLoader: DataLoader<string, unknown | null>;
  conversationLoader: DataLoader<string, unknown | null>;
  branchLoader: DataLoader<string, unknown | null>;
  turnLoader: DataLoader<string, unknown | null>;
  chatMembersLoader: DataLoader<string, Array<{ userId: string; joinedAt: Date }>>;
  sessionTicketsLoader: DataLoader<string, unknown[]>;
  channelMembershipLoader: DataLoader<string, boolean>;
  chatMembershipLoader: DataLoader<string, boolean>;
}
