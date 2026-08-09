import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/main.js";

const catalog = [
  {
    id: "github",
    name: "GitHub",
    provider: "GitHub",
    providerConfigKey: "github-getting-started",
    description: "GitHub data",
    guide: "Use the server helper",
    capabilities: [
      {
        id: "profile",
        name: "Profile",
        description: "Read profile",
        guide: "Use /user",
        allowedMethods: ["GET"],
        allowedPathPrefixes: ["/user"],
      },
      {
        id: "repositories",
        name: "Repositories",
        description: "Read repositories",
        guide: "Use /repos",
        allowedMethods: ["GET"],
        allowedPathPrefixes: ["/repos"],
      },
    ],
  },
];

function graphQlResponse(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Trace CLI integrations", () => {
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "agent-token");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_SESSION_GROUP_ID", "group-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test");
    stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("lists the catalog, account state, app access, and runtime guides", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as { operationName: string };
        if (request.operationName === "TraceCliIntegrationCatalog") {
          return graphQlResponse({ supportedAppIntegrations: catalog });
        }
        if (request.operationName === "TraceCliIntegrationConnections") {
          return graphQlResponse({ integrationConnections: [] });
        }
        return graphQlResponse({ appIntegrationBindings: [] });
      }),
    );

    await expect(run(["integration", "list", "--json"])).resolves.toBe(0);
    const value = JSON.parse(stdout.mock.calls.flat().join("")) as {
      integrations: Array<{ id: string; guide: string }>;
    };
    expect(value.integrations[0]).toMatchObject({
      id: "github",
      guide: "Use the server helper",
    });
  });

  it("adds least-privilege access and updates an existing stable binding", async () => {
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        operationName: string;
        variables: Record<string, unknown>;
      };
      if (request.operationName === "TraceCliIntegrationCatalog") {
        return graphQlResponse({ supportedAppIntegrations: catalog });
      }
      if (request.operationName === "TraceCliAppIntegrationBindings") {
        return graphQlResponse({
          appIntegrationBindings: [
            { id: "binding-1", providerConfigKey: "github-getting-started" },
          ],
        });
      }
      expect(request.operationName).toBe("TraceCliUpsertAppIntegrationBinding");
      expect(request.variables).toEqual({
        input: {
          id: "binding-1",
          sessionGroupId: "group-1",
          integrationId: "github",
          capabilityIds: ["profile"],
          executionIdentity: "viewer",
          sharedConnectionId: null,
        },
      });
      return graphQlResponse({
        upsertAppIntegrationBinding: {
          id: "binding-1",
          label: "GitHub",
          executionIdentity: "viewer",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      run(["integration", "add", "github", "--capabilities", "profile", "--json"]),
    ).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(stdout.mock.calls.flat().join("")).toContain('"selectedCapabilities"');
  });

  it("requires an explicit least-privilege choice when a provider has several capabilities", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as { operationName: string };
        return request.operationName === "TraceCliIntegrationCatalog"
          ? graphQlResponse({ supportedAppIntegrations: catalog })
          : graphQlResponse({ appIntegrationBindings: [] });
      }),
    );

    await expect(run(["integration", "add", "github", "--json"])).resolves.toBe(64);
    expect(stderr.mock.calls.flat().join("")).toContain("choose from: profile, repositories");
  });

  it("creates a service-account authorization link without exposing credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          variables: { input: Record<string, unknown> };
        };
        expect(request.variables.input).toEqual({ integrationId: "github", kind: "service" });
        expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer agent-token");
        return graphQlResponse({
          createNangoConnectSession: {
            connectLink: "https://connect.example.test/session",
            expiresAt: "2026-08-09T12:00:00.000Z",
          },
        });
      }),
    );

    await expect(run(["integration", "connect", "github", "--service", "--json"])).resolves.toBe(0);
    const output = stdout.mock.calls.flat().join("");
    expect(output).toContain("https://connect.example.test/session");
    expect(output).not.toContain("agent-token");
  });
});
