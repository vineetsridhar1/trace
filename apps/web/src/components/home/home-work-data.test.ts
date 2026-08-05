import { describe, expect, it } from "vitest";
import type { InboxItem } from "@trace/gql";
import type { SessionEntity, SessionGroupEntity } from "@trace/client-core";
import { buildHomeWorkData } from "./home-work-data";

const NOW = new Date("2026-07-30T16:00:00.000Z");

describe("home work ledger data", () => {
  it("includes owned and participating groups but excludes unrelated work", () => {
    const groups = {
      owned: group("owned", "me", "in_progress"),
      participating: group("participating", "someone-else", "in_progress"),
      unrelated: group("unrelated", "someone-else", "in_progress"),
    };
    const sessions = {
      participation: session("participation", "participating", "me", "active", "in_progress"),
      unrelated: session("unrelated-session", "unrelated", "other", "active", "in_progress"),
    };

    const result = buildHomeWorkData({
      currentUserId: "me",
      groups,
      sessions,
      sessionIdsByGroup: {
        participating: ["participation"],
        unrelated: ["unrelated"],
      },
      inboxItems: {},
      now: NOW,
    });

    expect(result.items.map((item) => item.id).sort()).toEqual(["owned", "participating"]);
    expect(result.totalOwnedOrParticipating).toBe(2);
  });

  it("groups failures with in-progress and actionable sessions under needs-you", () => {
    const groups = {
      failed: group("failed", "me", "in_progress"),
      needs: group("needs", "me", "needs_input"),
    };
    const inboxItems = {
      ask: {
        id: "ask",
        userId: "me",
        sourceId: "needs-session",
        status: "active",
        title: "Choose a direction",
        summary: "Pick the navigation style",
      } as unknown as InboxItem,
    };
    const sessions = {
      "failed-session": session("failed-session", "failed", "me", "failed", "in_progress"),
      "needs-session": session("needs-session", "needs", "me", "active", "needs_input"),
    };

    const result = buildHomeWorkData({
      currentUserId: "me",
      groups,
      sessions,
      sessionIdsByGroup: {
        failed: ["failed-session"],
        needs: ["needs-session"],
      },
      inboxItems,
      now: NOW,
    });

    expect(result.items.find((item) => item.id === "failed")?.bucket).toBe("in_progress");
    expect(result.items.find((item) => item.id === "needs")?.bucket).toBe("needs_you");
    expect(result.items.find((item) => item.id === "needs")?.statusText).toBe(
      "Pick the navigation style",
    );
  });

  it("shows completed work only when it completed today", () => {
    const today = group("today", "me", "merged", "2026-07-30T14:00:00.000Z");
    const yesterday = group("yesterday", "me", "merged", "2026-07-29T14:00:00.000Z");

    const result = buildHomeWorkData({
      currentUserId: "me",
      groups: { today, yesterday },
      sessions: {},
      sessionIdsByGroup: {},
      inboxItems: {},
      now: NOW,
    });

    expect(result.items.map((item) => item.id)).toEqual(["today"]);
    expect(result.items[0]?.bucket).toBe("done_today");
    expect(result.totalOwnedOrParticipating).toBe(2);
  });
});

function group(
  id: string,
  ownerId: string,
  status: string,
  updatedAt = "2026-07-30T14:00:00.000Z",
): SessionGroupEntity {
  return {
    id,
    name: id,
    kind: "coding",
    status,
    owner: { id: ownerId, name: ownerId },
    createdAt: updatedAt,
    updatedAt,
  } as unknown as SessionGroupEntity;
}

function session(
  id: string,
  groupId: string,
  creatorId: string,
  agentStatus: string,
  sessionStatus: string,
): SessionEntity {
  return {
    id,
    name: id,
    sessionGroupId: groupId,
    createdById: creatorId,
    agentStatus,
    sessionStatus,
    createdAt: "2026-07-30T13:00:00.000Z",
    updatedAt: "2026-07-30T15:00:00.000Z",
  } as unknown as SessionEntity;
}
