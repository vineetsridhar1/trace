import { describe, expect, it } from "vitest";
import { formatMessageTimestamp } from "../src/session/messages.js";

function localTimestamp(year: number, month: number, day: number, hour = 8, minute = 10): string {
  return new Date(year, month, day, hour, minute).toISOString();
}

describe("formatMessageTimestamp", () => {
  const now = new Date(2026, 6, 21, 12);

  it("labels messages from today", () => {
    expect(formatMessageTimestamp(localTimestamp(2026, 6, 21), now)).toBe("Today 8:10 AM");
  });

  it("labels messages from yesterday", () => {
    expect(formatMessageTimestamp(localTimestamp(2026, 6, 20), now)).toBe("Yesterday 8:10 AM");
  });

  it("uses the weekday for earlier messages in the past week", () => {
    const sunday = new Date(2026, 6, 26, 12);
    expect(formatMessageTimestamp(localTimestamp(2026, 6, 20), sunday)).toBe("Monday 8:10 AM");
  });

  it("uses the short date for messages before the current week", () => {
    expect(formatMessageTimestamp(localTimestamp(2026, 6, 13), now)).toBe("Mon, Jul 13 at 8:10 AM");
  });

  it("keeps yesterday when it falls in the previous week", () => {
    const monday = new Date(2026, 6, 20, 12);
    expect(formatMessageTimestamp(localTimestamp(2026, 6, 19), monday)).toBe("Yesterday 8:10 AM");
  });
});
