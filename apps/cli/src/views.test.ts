import { describe, expect, it } from "vitest";
import { findByName } from "./resolve.js";
import { formatTable, relativeTime } from "./output.js";
import {
  channelToJson,
  messageToJson,
  messageToLine,
  sessionToJson,
  sessionToRow,
  ticketToJson,
  type ChannelMessageItem,
  type SessionListItem,
} from "./views.js";

const session: SessionListItem = {
  id: "0f9b2ad1-3c44-4f55-a666-777888999000",
  name: "fix-login-bug",
  agentStatus: "active",
  sessionStatus: "needs_input",
  tool: "claude_code",
  branch: "fix/login",
  updatedAt: "2026-07-03T12:00:00.000Z",
  repo: { name: "trace" },
};

const message: ChannelMessageItem = {
  id: "msg-1",
  text: "hello from the CLI",
  createdAt: "2026-07-03T12:34:56.000Z",
  actor: { type: "user", id: "user-1", name: "Alex" },
};

// These snapshots are the documented `--json` shapes; changing them is a
// breaking change for scripts and the nvim plugin's one-shot calls.
describe("stable --json shapes", () => {
  it("sessions list", () => {
    expect(sessionToJson(session)).toMatchInlineSnapshot(`
      {
        "agentStatus": "active",
        "branch": "fix/login",
        "id": "0f9b2ad1-3c44-4f55-a666-777888999000",
        "name": "fix-login-bug",
        "repo": "trace",
        "sessionStatus": "needs_input",
        "tool": "claude_code",
        "updatedAt": "2026-07-03T12:00:00.000Z",
      }
    `);
  });

  it("channels list", () => {
    expect(channelToJson({ id: "chan-1", name: "general", type: "text", memberCount: 4 }))
      .toMatchInlineSnapshot(`
      {
        "id": "chan-1",
        "memberCount": 4,
        "name": "general",
        "type": "text",
      }
    `);
  });

  it("tickets list", () => {
    expect(
      ticketToJson({
        id: "ticket-1",
        title: "Fix flaky test",
        status: "todo",
        priority: "high",
        updatedAt: "2026-07-03T09:00:00.000Z",
      }),
    ).toMatchInlineSnapshot(`
      {
        "id": "ticket-1",
        "priority": "high",
        "status": "todo",
        "title": "Fix flaky test",
        "updatedAt": "2026-07-03T09:00:00.000Z",
      }
    `);
  });

  it("channel messages", () => {
    expect(messageToJson(message)).toMatchInlineSnapshot(`
      {
        "actor": {
          "id": "user-1",
          "name": "Alex",
          "type": "user",
        },
        "createdAt": "2026-07-03T12:34:56.000Z",
        "id": "msg-1",
        "text": "hello from the CLI",
      }
    `);
  });
});

describe("human output", () => {
  it("renders aligned session rows", () => {
    const now = Date.parse("2026-07-03T12:30:00.000Z");
    expect(formatTable([["ID", "NAME"], sessionToRow(session, now).slice(0, 2)])).toBe(
      "ID        NAME\n0f9b2ad1  fix-login-bug",
    );
    expect(sessionToRow(session, now)[6]).toBe("30m ago");
  });

  it("renders message lines with actor and timestamp", () => {
    expect(messageToLine(message)).toBe("[2026-07-03 12:34] Alex: hello from the CLI");
  });

  it("formats relative timestamps", () => {
    const now = Date.parse("2026-07-03T12:00:00.000Z");
    expect(relativeTime("2026-07-03T11:59:40.000Z", now)).toBe("now");
    expect(relativeTime("2026-07-03T10:00:00.000Z", now)).toBe("2h ago");
    expect(relativeTime("2026-06-30T12:00:00.000Z", now)).toBe("3d ago");
    expect(relativeTime("2026-01-01T00:00:00.000Z", now)).toBe("2026-01-01");
  });
});

describe("findByName", () => {
  const channels = [{ name: "general" }, { name: "engineering" }, { name: "eng-alerts" }];

  it("resolves case-insensitively", () => {
    expect(findByName(channels, "GENERAL", "channel").name).toBe("general");
  });

  it("lists near-matches for unknown names", () => {
    expect(() => findByName(channels, "eng", "channel")).toThrow(
      /No channel named "eng"\. Did you mean:\n {2}engineering\n {2}eng-alerts/,
    );
  });

  it("falls back to listing known names when nothing is close", () => {
    expect(() => findByName(channels, "zzz", "channel")).toThrow(/general/);
  });
});

describe("normalizeRemoteUrl", () => {
  it("matches https, ssh, and .git-suffixed remotes", async () => {
    const { normalizeRemoteUrl } = await import("./commands/runtime.js");
    const expected = "github.com/acme/widgets";
    expect(normalizeRemoteUrl("https://github.com/acme/widgets.git")).toBe(expected);
    expect(normalizeRemoteUrl("git@github.com:acme/widgets.git")).toBe(expected);
    expect(normalizeRemoteUrl("ssh://github.com/acme/widgets/")).toBe(expected);
    expect(normalizeRemoteUrl("HTTPS://GitHub.com/Acme/Widgets")).toBe(expected);
  });
});
