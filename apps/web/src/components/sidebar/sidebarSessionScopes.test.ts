import { describe, expect, it } from "vitest";

import {
  getSidebarSessionScope,
  readSidebarSessionScopes,
  SIDEBAR_SESSION_SCOPES_KEY,
  toggleSidebarSessionScope,
} from "./sidebarSessionScopes";

function createStorage(
  initial: Record<string, string> = {},
): Pick<Storage, "getItem" | "setItem"> {
  const values = { ...initial };

  return {
    getItem: (key: string) => (Object.hasOwn(values, key) ? values[key] : null),
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
  };
}

describe("sidebar session scopes", () => {
  it("toggles only the requested channel scope", () => {
    const storage = createStorage({
      [SIDEBAR_SESSION_SCOPES_KEY]: JSON.stringify({
        alpha: "mine",
        beta: "mine",
      }),
    });

    const nextScopes = toggleSidebarSessionScope("beta", storage);

    expect(nextScopes).toEqual({
      alpha: "mine",
      beta: "all",
    });
    expect(readSidebarSessionScopes(storage)).toEqual(nextScopes);
  });

  it("defaults channels without a stored scope to mine", () => {
    expect(getSidebarSessionScope({}, "alpha")).toBe("mine");
  });

  it("ignores invalid stored scope values", () => {
    const storage = createStorage({
      [SIDEBAR_SESSION_SCOPES_KEY]: JSON.stringify({
        alpha: "all",
        beta: "everyone",
        gamma: true,
      }),
    });

    expect(readSidebarSessionScopes(storage)).toEqual({ alpha: "all" });
  });
});
