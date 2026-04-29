import type { Prisma } from "@prisma/client";
import type { SessionRole } from "@trace/gql";

export const CONTROLLER_RUN_SESSION_ROLE = "ultraplan_controller_run" satisfies SessionRole;

export function visibleSessionWhere(): Prisma.SessionWhereInput {
  return { role: { not: CONTROLLER_RUN_SESSION_ROLE } };
}

export function isUserVisibleSession(session: { role?: SessionRole | string | null }): boolean {
  return session.role !== CONTROLLER_RUN_SESSION_ROLE;
}
