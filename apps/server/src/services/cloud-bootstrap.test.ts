import { writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { loadCloudConfig, seedCloudForOrg, type RawCloudConfig } from "./cloud-bootstrap.js";
import type { createPrismaMock } from "../../test/helpers.js";

const prismaMock = prisma as unknown as ReturnType<typeof createPrismaMock>;

const CONFIG: RawCloudConfig = {
  name: "Trace Cloud",
  startUrl: "https://launcher.example.com/start",
  stopUrl: "https://launcher.example.com/stop",
  statusUrl: "https://launcher.example.com/status",
  auth: { type: "bearer", secret: "super-secret-token" },
  startupTimeoutSeconds: 120,
  deprovisionPolicy: "on_session_end",
  capabilities: { supportedTools: ["claude_code"] },
  runtimeEnv: [{ name: "MY_VAR", secret: "my-value" }],
};

describe("cloud-bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => Promise<unknown>) => callback(prismaMock),
    );
    prismaMock.$executeRaw.mockResolvedValue(1);
    prismaMock.orgSecret.upsert.mockImplementation(async ({ where }: { where: unknown }) => {
      const name = (where as { organizationId_name: { name: string } }).organizationId_name.name;
      return { id: `secret-${name}` };
    });
  });

  describe("loadCloudConfig", () => {
    it("reads and parses the config file", () => {
      const filePath = path.join(tmpdir(), `cloud.config.${process.pid}.json`);
      writeFileSync(filePath, JSON.stringify(CONFIG), "utf-8");
      vi.stubEnv("TRACE_CLOUD_CONFIG_PATH", filePath);

      const loaded = loadCloudConfig();
      expect(loaded).not.toBeNull();
      expect(loaded?.startUrl).toBe("https://launcher.example.com/start");
      expect(loaded?.auth).toEqual({ type: "bearer", secret: "super-secret-token" });
      expect(loaded?.runtimeEnv).toEqual([{ name: "MY_VAR", secret: "my-value" }]);

      vi.unstubAllEnvs();
    });
  });

  describe("seedCloudForOrg", () => {
    it("creates a managed default cloud env and upserts its secrets", async () => {
      // managed lookup, existing-provisioned lookup, existing-default lookup
      prismaMock.agentEnvironment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await seedCloudForOrg("org-1", CONFIG);

      expect(result).toBe("created");
      // Auth token + runtime env stored as OrgSecrets, never raw in the config.
      expect(prismaMock.orgSecret.upsert).toHaveBeenCalledTimes(2);
      const created = prismaMock.agentEnvironment.create.mock.calls[0][0] as {
        data: {
          adapterType: string;
          enabled: boolean;
          isDefault: boolean;
          config: Record<string, unknown>;
        };
      };
      expect(created.data.adapterType).toBe("provisioned");
      expect(created.data.enabled).toBe(true);
      expect(created.data.isDefault).toBe(true);
      expect(created.data.config.managedBy).toBe("trace-cloud-config");
      expect(created.data.config.auth).toEqual({ type: "bearer", secretId: "secret-TRACE_CLOUD_AUTH" });
      expect(created.data.config.runtimeEnv).toEqual([
        { name: "MY_VAR", secretId: "secret-TRACE_CLOUD_ENV_MY_VAR" },
      ]);
    });

    it("does not steal an existing default", async () => {
      prismaMock.agentEnvironment.findFirst
        .mockResolvedValueOnce(null) // no managed env
        .mockResolvedValueOnce(null) // no existing enabled provisioned env
        .mockResolvedValueOnce({ id: "other-default" }); // org already has a default

      const result = await seedCloudForOrg("org-1", CONFIG);

      expect(result).toBe("created");
      const created = prismaMock.agentEnvironment.create.mock.calls[0][0] as {
        data: { isDefault: boolean };
      };
      expect(created.data.isDefault).toBe(false);
    });

    it("skips when the org already runs its own cloud (override)", async () => {
      prismaMock.agentEnvironment.findFirst
        .mockResolvedValueOnce(null) // no managed env
        .mockResolvedValueOnce({ id: "customer-cloud" }); // customer's own enabled provisioned env

      const result = await seedCloudForOrg("org-1", CONFIG);

      expect(result).toBe("skipped_override");
      expect(prismaMock.orgSecret.upsert).not.toHaveBeenCalled();
      expect(prismaMock.agentEnvironment.create).not.toHaveBeenCalled();
      expect(prismaMock.agentEnvironment.update).not.toHaveBeenCalled();
    });

    it("refreshes an existing managed env without touching enabled/isDefault", async () => {
      prismaMock.agentEnvironment.findFirst.mockResolvedValueOnce({ id: "managed-1" });

      const result = await seedCloudForOrg("org-1", CONFIG);

      expect(result).toBe("updated");
      expect(prismaMock.agentEnvironment.create).not.toHaveBeenCalled();
      const update = prismaMock.agentEnvironment.update.mock.calls[0][0] as {
        where: { id: string };
        data: { config: Record<string, unknown>; enabled?: boolean; isDefault?: boolean };
      };
      expect(update.where.id).toBe("managed-1");
      expect(update.data.config.managedBy).toBe("trace-cloud-config");
      expect(update.data.enabled).toBeUndefined();
      expect(update.data.isDefault).toBeUndefined();
    });
  });
});
