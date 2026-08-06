import { describe, expect, it } from "vitest";
import type { SessionGroupRow } from "../channel/sessions-table-types";
import {
  getSidebarSessionGroupStatus,
  getSidebarSessionStatusOrder,
} from "./ChannelOwnedSessions";

function row(init: { agentStatus: string; sessionStatus: string }): SessionGroupRow {
  return {
    displayAgentStatus: init.agentStatus,
    displaySessionStatus: init.sessionStatus,
  } as SessionGroupRow;
}

describe("getSidebarSessionGroupStatus", () => {
  it("puts failed agents in the failed sidebar stack", () => {
    expect(getSidebarSessionGroupStatus(row({ agentStatus: "failed", sessionStatus: "in_review" }))).toBe(
      "failed",
    );
  });

  it("orders the failed stack before in review", () => {
    expect(getSidebarSessionStatusOrder("failed")).toBeLessThan(
      getSidebarSessionStatusOrder("in_review"),
    );
  });

  it("keeps non-failed agents in their lifecycle stack", () => {
    expect(getSidebarSessionGroupStatus(row({ agentStatus: "done", sessionStatus: "in_review" }))).toBe(
      "in_review",
    );
  });
});
