import { describe, expect, it } from "vitest";
import {
  BROWSER_ADDRESS_HISTORY_STORAGE_KEY,
  readBrowserAddressHistory,
  rememberBrowserAddress,
} from "./browser-address-history";

describe("browser address history", () => {
  it("moves a visited address to the front without duplicates", () => {
    expect(
      rememberBrowserAddress(
        ["https://first.example", "https://second.example"],
        "https://second.example",
      ),
    ).toEqual(["https://second.example/", "https://first.example/"]);
  });

  it("does not remember the blank browser state", () => {
    const history = ["https://example.com"];
    expect(rememberBrowserAddress(history, "about:blank")).toBe(history);
  });

  it("removes credentials, queries, and fragments before remembering an address", () => {
    expect(
      rememberBrowserAddress(
        [],
        "https://username:password@example.com/path?token=secret#access_token",
      ),
    ).toEqual(["https://example.com/path"]);
  });

  it("sanitizes and deduplicates stored history", () => {
    expect(
      readBrowserAddressHistory({
        getItem: (key) =>
          key === BROWSER_ADDRESS_HISTORY_STORAGE_KEY
            ? JSON.stringify([
                "https://example.com/path?token=secret",
                "https://example.com/path#fragment",
                "about:blank",
              ])
            : null,
      }),
    ).toEqual(["https://example.com/path"]);
  });

  it("ignores malformed stored history", () => {
    expect(
      readBrowserAddressHistory({
        getItem: (key) => (key === BROWSER_ADDRESS_HISTORY_STORAGE_KEY ? "not json" : null),
      }),
    ).toEqual([]);
  });
});
