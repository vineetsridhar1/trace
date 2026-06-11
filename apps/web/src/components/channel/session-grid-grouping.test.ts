import { describe, expect, it } from "vitest";
import { buildSessionGridRows } from "./session-grid-grouping";
import { isSessionStatusHeaderRow, type SessionGroupRow } from "./sessions-table-types";

function row(init: {
  id: string;
  ownerId: string;
  updatedAt: string;
  status?: string;
}): SessionGroupRow {
  return {
    id: init.id,
    displaySessionStatus: init.status ?? "in_progress",
    displayAgentStatus: "idle",
    owner: { id: init.ownerId, name: init.ownerId },
    updatedAt: init.updatedAt,
    createdAt: init.updatedAt,
    _sessionCount: 1,
  } as unknown as SessionGroupRow;
}

function orderedIds(rows: SessionGroupRow[], currentUserId: string | null): string[] {
  return buildSessionGridRows({
    collapsedStatuses: new Set(),
    filterModel: null,
    rows,
    currentUserId,
  })
    .filter((r): r is SessionGroupRow => !isSessionStatusHeaderRow(r))
    .map((r) => r.id);
}

describe("buildSessionGridRows owner-first ordering", () => {
  const mine = row({ id: "mine", ownerId: "me", updatedAt: "2024-01-01T00:00:00Z" });
  const theirs = row({ id: "theirs", ownerId: "other", updatedAt: "2024-06-01T00:00:00Z" });

  it("puts the current user's sessions first within a status group", () => {
    // `theirs` is newer, but `mine` should still come first.
    expect(orderedIds([theirs, mine], "me")).toEqual(["mine", "theirs"]);
  });

  it("falls back to recency when no current user is provided", () => {
    expect(orderedIds([mine, theirs], null)).toEqual(["theirs", "mine"]);
  });

  it("orders by recency among the current user's own sessions", () => {
    const older = row({ id: "older", ownerId: "me", updatedAt: "2024-01-01T00:00:00Z" });
    const newer = row({ id: "newer", ownerId: "me", updatedAt: "2024-02-01T00:00:00Z" });
    expect(orderedIds([older, newer], "me")).toEqual(["newer", "older"]);
  });
});
