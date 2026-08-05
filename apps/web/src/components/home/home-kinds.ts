import type { SessionGroupKind } from "@trace/gql";

export type HomeCreatableKind = Exclude<SessionGroupKind, "design_system">;
