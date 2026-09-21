import { createHmac } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NangoConnectionProvider } from "./nango-connection-provider.js";

describe("NangoConnectionProvider", () => {
  afterEach(() => {
    delete process.env.NANGO_WEBHOOK_SIGNING_KEY;
    delete process.env.NANGO_SECRET_KEY;
    vi.unstubAllGlobals();
  });

  it("accepts only the HMAC-SHA256 signature for the exact webhook body", () => {
    process.env.NANGO_WEBHOOK_SIGNING_KEY = "webhook-secret";
    const body = Buffer.from('{"type":"auth"}');
    const signature = createHmac("sha256", "webhook-secret").update(body).digest("hex");
    const provider = new NangoConnectionProvider();

    expect(provider.verifyWebhook(body, signature)).toBe(true);
    expect(provider.verifyWebhook(Buffer.from('{"type":"sync"}'), signature)).toBe(false);
    expect(provider.verifyWebhook(body, "invalid")).toBe(false);
  });

  it("retries only read-only provider requests", async () => {
    process.env.NANGO_SECRET_KEY = "secret";
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new NangoConnectionProvider();
    const base = {
      connectionId: "connection-1",
      providerConfigKey: "github",
      path: "/user",
      query: null,
      contentType: "application/json",
      body: Buffer.from("{}"),
    };

    await provider.proxy({ ...base, method: "GET" });
    await provider.proxy({ ...base, method: "POST" });

    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Retries")).toBe("2");
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Retries")).toBeNull();
  });

  it("discovers tools from Nango MCP sources without exposing credentials", async () => {
    process.env.NANGO_SECRET_KEY = "secret";
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith("/proxy/mcp")) {
        const request = JSON.parse(String(init?.body)) as { id?: unknown; method: string };
        if (request.method === "notifications/initialized")
          return new Response(null, { status: 202 });
        if (request.method === "initialize") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              result: {
                protocolVersion: "2025-06-18",
                capabilities: { tools: {} },
                serverInfo: { name: "nango", version: "1.0.0" },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result: {
              tools: [
                {
                  name: "search_issues",
                  description: "Search issues",
                  inputSchema: { type: "object", properties: { query: { type: "string" } } },
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new NangoConnectionProvider();

    await expect(
      provider.listTools({
        connectionId: "nango-connection-1",
        providerConfigKey: "linear-mcp",
        source: "native_mcp",
      }),
    ).resolves.toEqual([expect.objectContaining({ id: "search_issues", name: "search_issues" })]);
    const providerRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/proxy/mcp"),
    );
    const headers = new Headers(providerRequest?.[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer secret");
    expect(headers.get("Connection-Id")).toBe("nango-connection-1");
    expect(headers.get("Provider-Config-Key")).toBe("linear-mcp");
  });

  it("routes a discovered tool back to its Nango MCP source", async () => {
    process.env.NANGO_SECRET_KEY = "secret";
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (new URL(url).pathname !== "/mcp") return new Response("Not found", { status: 404 });
      if (init?.method === "DELETE") return new Response(null, { status: 200 });
      const request = JSON.parse(String(init?.body)) as { id?: unknown; method: string };
      if (request.method === "notifications/initialized")
        return new Response(null, { status: 202 });
      if (request.method === "initialize") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result: {
              protocolVersion: "2025-06-18",
              capabilities: { tools: {} },
              serverInfo: { name: "nango", version: "1.0.0" },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: { content: [{ type: "text", text: "issue-1" }] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new NangoConnectionProvider();

    await expect(
      provider.callTool({
        connectionId: "nango-connection-1",
        providerConfigKey: "linear-mcp",
        source: "nango_actions",
        toolId: "search_issues",
        arguments: { query: "login" },
      }),
    ).resolves.toEqual({ content: [{ type: "text", text: "issue-1" }] });
    const toolCall = fetchMock.mock.calls.find(([, init]) =>
      String(init?.body).includes('"method":"tools/call"'),
    );
    expect(String(toolCall?.[0])).toBe("https://api.nango.dev/mcp");
    const request = JSON.parse(String(toolCall?.[1]?.body)) as {
      method: string;
      params: unknown;
    };
    expect(request).toMatchObject({
      method: "tools/call",
      params: { name: "search_issues", arguments: { query: "login" } },
    });
  });
});
