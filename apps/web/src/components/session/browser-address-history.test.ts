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
    ).toEqual(["https://second.example", "https://first.example"]);
  });

  it("does not remember the blank browser state", () => {
    const history = ["https://example.com"];
    expect(rememberBrowserAddress(history, "about:blank")).toBe(history);
  });

  it("ignores malformed stored history", () => {
    expect(
      readBrowserAddressHistory({
        getItem: (key) => (key === BROWSER_ADDRESS_HISTORY_STORAGE_KEY ? "not json" : null),
      }),
    ).toEqual([]);
  });
});
