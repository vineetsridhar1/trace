import { describe, expect, it } from "vitest";
import {
  findAction,
  getActionsByScope,
  getAllActions,
  validateActionParams,
} from "./action-registry.js";

describe("action registry", () => {
  it("exposes the full action list", () => {
    expect(getAllActions().some((action) => action.name === "no_op")).toBe(true);
  });

  it("filters actions by scope", () => {
    const chatActions = getActionsByScope("chat");

    expect(chatActions.some((action) => action.name === "message.send")).toBe(true);
    expect(chatActions.some((action) => action.name === "session.pause")).toBe(false);
  });

  it("finds actions by name", () => {
    expect(findAction("ticket.create")?.service).toBe("ticketService");
    expect(findAction("missing")).toBeUndefined();
  });

  it("validates required fields, types, and enums", () => {
    const action = findAction("ticket.create");
    expect(action).toBeDefined();

    expect(validateActionParams(action!, { title: "Ship it", priority: "high" })).toEqual({
      valid: true,
      errors: [],
    });

    expect(validateActionParams(action!, { priority: "invalid", labels: "oops" as unknown as string[] }))
      .toEqual({
        valid: false,
        errors: [
          "Missing required field: title",
          "Field priority must be one of: low, medium, high, urgent",
          "Field labels must be an array",
        ],
      });
  });

  it("accepts the supported channel.create inputs and rejects stale ones", () => {
    const action = findAction("channel.create");
    expect(action).toBeDefined();

    expect(validateActionParams(action!, {
      name: "eng-platform",
      type: "coding",
      repoId: "repo-1",
      projectIds: ["proj-1"],
    })).toEqual({
      valid: true,
      errors: [],
    });

    expect(validateActionParams(action!, {
      name: "eng-platform",
      projectId: "proj-1",
    } as Record<string, unknown>)).toEqual({
      valid: false,
      errors: ["Unknown field: projectId"],
    });
  });

  it("validates updated project.linkEntity and session.list enums", () => {
    const projectLink = findAction("project.linkEntity");
    const sessionList = findAction("session.list");
    expect(projectLink).toBeDefined();
    expect(sessionList).toBeDefined();

    expect(validateActionParams(projectLink!, {
      entityType: "repo",
      entityId: "repo-1",
      projectId: "proj-1",
    })).toEqual({
      valid: false,
      errors: ["Field entityType must be one of: channel, ticket, session"],
    });

    expect(validateActionParams(sessionList!, { agentStatus: "active" })).toEqual({
      valid: true,
      errors: [],
    });

    expect(validateActionParams(sessionList!, { agentStatus: "running" })).toEqual({
      valid: false,
      errors: ["Field agentStatus must be one of: not_started, active, done, failed, stopped"],
    });
  });
});
