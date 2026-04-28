import { describe, expect, it } from "vitest";
import {
  routePathFromNotificationLink,
  sessionIdFromNotificationLink,
  shouldNavigateToNotificationPath,
} from "./notification-deeplink";

describe("routePathFromNotificationLink", () => {
  it("normalizes Trace custom-scheme session links", () => {
    expect(routePathFromNotificationLink("trace://sessions/g1/s1")).toBe("/sessions/g1/s1");
  });

  it("normalizes Trace universal links", () => {
    expect(routePathFromNotificationLink("https://gettrace.org/m/sessions/g1/s1")).toBe(
      "/sessions/g1/s1",
    );
  });

  it("normalizes bridge review links to the connections tab", () => {
    expect(routePathFromNotificationLink("trace://connections")).toBe("/(connections)");
    expect(routePathFromNotificationLink("trace://connections?requestId=req-1")).toBe(
      "/(connections)?requestId=req-1",
    );
    expect(routePathFromNotificationLink("https://gettrace.org/m/connections")).toBe(
      "/(connections)",
    );
  });

  it("normalizes native app-link paths", () => {
    expect(routePathFromNotificationLink("/m/sessions/g1/s1")).toBe("/sessions/g1/s1");
  });

  it("rejects unsupported external links", () => {
    expect(routePathFromNotificationLink("https://example.com/m/sessions/g1/s1")).toBeNull();
  });

  it("rejects unsupported internal notification routes", () => {
    expect(routePathFromNotificationLink("trace://settings")).toBeNull();
    expect(routePathFromNotificationLink("/settings")).toBeNull();
  });
});

describe("sessionIdFromNotificationLink", () => {
  it("extracts the session id from a session deep link", () => {
    expect(sessionIdFromNotificationLink("trace://sessions/g1/s1")).toBe("s1");
  });

  it("returns null for non-session links", () => {
    expect(sessionIdFromNotificationLink("trace://connections")).toBeNull();
  });
});

describe("shouldNavigateToNotificationPath", () => {
  it("does not navigate when a session notification targets the current session", () => {
    expect(shouldNavigateToNotificationPath("/sessions/g1/s1", "/sessions/g1/s1")).toBe(false);
  });

  it("ignores query strings and trailing slashes when comparing session routes", () => {
    expect(shouldNavigateToNotificationPath("/sessions/g1/s1/", "/sessions/g1/s1?foo=bar")).toBe(
      false,
    );
  });

  it("navigates when a session notification targets a different session", () => {
    expect(shouldNavigateToNotificationPath("/sessions/g1/s1", "/sessions/g1/s2")).toBe(true);
  });

  it("always navigates for non-session notification routes", () => {
    expect(
      shouldNavigateToNotificationPath("/(connections)", "/(connections)?requestId=req-1"),
    ).toBe(true);
  });
});
