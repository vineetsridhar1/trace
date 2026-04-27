import { describe, expect, it } from "vitest";
import { routePathFromNotificationLink } from "./notification-deeplink";

describe("routePathFromNotificationLink", () => {
  it("normalizes Trace custom-scheme session links", () => {
    expect(routePathFromNotificationLink("trace://sessions/g1/s1")).toBe("/sessions/g1/s1");
  });

  it("normalizes Trace universal links", () => {
    expect(routePathFromNotificationLink("https://gettrace.org/m/sessions/g1/s1")).toBe(
      "/sessions/g1/s1",
    );
  });

  it("rejects unsupported external links", () => {
    expect(routePathFromNotificationLink("https://example.com/m/sessions/g1/s1")).toBeNull();
  });

  it("rejects unsupported internal notification routes", () => {
    expect(routePathFromNotificationLink("trace://settings")).toBeNull();
    expect(routePathFromNotificationLink("/settings")).toBeNull();
  });
});
