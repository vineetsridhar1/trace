import type { ActorType } from "./generated/types";

export interface Context {
  userId: string | undefined;
  actorType: ActorType;
}
