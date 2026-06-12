import { afterEach, describe, expect, it, vi } from "vitest";
import { isGitHubOrgMember } from "./github-org.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isGitHubOrgMember", () => {
  it("returns true for an active membership", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ state: "active" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(isGitHubOrgMember("tok", "opendoor-labs")).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/user/memberships/orgs/opendoor-labs");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("returns false when the token lacks read:org (403)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 })),
    );

    await expect(isGitHubOrgMember("tok", "opendoor-labs")).resolves.toBe(false);
  });

  it("returns false when not a member (404)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 })),
    );

    await expect(isGitHubOrgMember("tok", "opendoor-labs")).resolves.toBe(false);
  });
});
