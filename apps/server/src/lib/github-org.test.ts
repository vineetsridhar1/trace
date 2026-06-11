import { afterEach, describe, expect, it, vi } from "vitest";
import { isGitHubOrgMember, listGitHubOrgMemberIds } from "./github-org.js";

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

describe("listGitHubOrgMemberIds", () => {
  it("aggregates member ids across pages", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, login: `u${i + 1}` }));
    const page2 = [
      { id: 101, login: "u101" },
      { id: 102, login: "u102" },
    ];
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      const body = call === 1 ? page1 : page2;
      return new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const ids = await listGitHubOrgMemberIds("tok", "opendoor-labs");

    expect(ids).not.toBeNull();
    expect(ids?.size).toBe(102);
    expect(ids?.has(1)).toBe(true);
    expect(ids?.has(102)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when a page request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );

    await expect(listGitHubOrgMemberIds("tok", "opendoor-labs")).resolves.toBeNull();
  });

  it("returns null when the response is not an array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ message: "unexpected" }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(listGitHubOrgMemberIds("tok", "opendoor-labs")).resolves.toBeNull();
  });
});
