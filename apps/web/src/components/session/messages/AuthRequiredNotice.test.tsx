import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventScopeContext } from "../EventScopeContext";
import { AuthRequiredNotice } from "./AuthRequiredNotice";

const entityFields = vi.hoisted(() => ({
  tool: "claude_code" as string | undefined,
  sessionGroupId: "group-1" as string | null | undefined,
}));

vi.mock("@trace/client-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@trace/client-core")>();
  return {
    ...actual,
    useEntityField: (_type: string, _id: string, field: string) =>
      entityFields[field as keyof typeof entityFields],
  };
});

function renderNotice(): string {
  return renderToStaticMarkup(
    <EventScopeContext.Provider value="session:session-1">
      <AuthRequiredNotice timestamp="2026-08-05T12:00:00.000Z" />
    </EventScopeContext.Provider>,
  );
}

beforeEach(() => {
  entityFields.tool = "claude_code";
  entityFields.sessionGroupId = "group-1";
});

describe("AuthRequiredNotice", () => {
  it("renders an actionable Claude login notice without the raw CLI error", () => {
    const markup = renderNotice();

    expect(markup).toContain("Claude Code needs login");
    expect(markup).toContain("Log in below, then resend your message.");
    expect(markup).toContain("<button");
    expect(markup).not.toContain("Failed to authenticate");
    expect(markup).not.toContain("OAuth session expired");
  });

  it("falls back to terminal instructions when an in-app login flow is unavailable", () => {
    entityFields.tool = "antigravity";
    const markup = renderNotice();

    expect(markup).toContain("Antigravity needs login");
    expect(markup).toContain("Log in from a terminal on the runtime");
    expect(markup).not.toContain("<button");
  });
});
