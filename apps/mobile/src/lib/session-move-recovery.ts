import type { SessionConnection } from "@trace/gql";

type SessionConnectionLike = Pick<SessionConnection, "state"> | null | undefined;

export function shouldAllowUnverifiedSourceGitStatusForMove(
  sessionConnection: SessionConnectionLike,
  groupConnection?: SessionConnectionLike,
): boolean {
  const state = sessionConnection?.state ?? groupConnection?.state;
  return (
    state === "disconnected" ||
    state === "failed" ||
    state === "timed_out" ||
    state === "deprovision_failed"
  );
}
