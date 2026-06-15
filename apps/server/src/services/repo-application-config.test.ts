import { describe, expect, it } from "vitest";
import { ValidationError } from "../lib/errors.js";
import { repoApplicationConfigService } from "./repo-application-config.js";

describe("repoApplicationConfigService", () => {
  it("normalizes defaults and preserves unrelated setupConfig keys", () => {
    const merged = repoApplicationConfigService.mergeIntoSetupConfig(
      { legacy: { keep: true } },
      {
        setupScripts: [{ id: "install", name: "Install", command: "pnpm install" }],
        applications: [
          {
            id: "web",
            name: "Web",
            processes: [
              {
                id: "dev",
                name: "Dev",
                command: "pnpm dev",
                ports: [{ id: "web", label: "Web", port: 3000 }],
              },
            ],
          },
        ],
      },
    );

    expect(merged).toMatchObject({
      legacy: { keep: true },
      applications: {
        setupScripts: [
          {
            id: "install",
            name: "Install",
            command: "pnpm install",
            workingDirectory: ".",
          },
        ],
        applications: [
          {
            id: "web",
            processes: [
              {
                id: "dev",
                required: true,
                workingDirectory: ".",
                ports: [
                  {
                    id: "web",
                    protocol: "http",
                    defaultForwardingEnabled: false,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it("rejects unsafe working directories", () => {
    expect(() =>
      repoApplicationConfigService.normalize({
        setupScripts: [
          {
            id: "install",
            name: "Install",
            command: "pnpm install",
            workingDirectory: "../outside",
          },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it("rejects duplicate ids inside a parent", () => {
    expect(() =>
      repoApplicationConfigService.normalize({
        setupScripts: [
          { id: "install", name: "Install", command: "pnpm install" },
          { id: "install", name: "Install again", command: "pnpm install" },
        ],
      }),
    ).toThrow("Setup script IDs must be unique");
  });

  it("normalizes env vars into key/secret pairs", () => {
    const config = repoApplicationConfigService.normalize({
      applications: [
        {
          id: "web",
          name: "Web",
          processes: [
            {
              id: "dev",
              name: "Dev",
              command: "pnpm dev",
              env: [{ key: "DATABASE_URL", secretName: "prod-db-url" }],
              ports: [{ id: "web", label: "Web", port: 3000 }],
            },
          ],
        },
      ],
    });

    expect(config.applications[0].processes[0].env).toEqual([
      { key: "DATABASE_URL", secretName: "prod-db-url" },
    ]);
  });

  it("rejects invalid env keys and incomplete env entries", () => {
    expect(() =>
      repoApplicationConfigService.normalize({
        setupScripts: [
          {
            id: "install",
            name: "Install",
            command: "pnpm install",
            env: [{ key: "1BAD", secretName: "token" }],
          },
        ],
      }),
    ).toThrow(ValidationError);

    expect(() =>
      repoApplicationConfigService.normalize({
        setupScripts: [
          {
            id: "install",
            name: "Install",
            command: "pnpm install",
            env: [{ key: "TOKEN", secretName: "" }],
          },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it("rejects invalid ports", () => {
    expect(() =>
      repoApplicationConfigService.normalize({
        applications: [
          {
            id: "web",
            name: "Web",
            processes: [
              {
                id: "dev",
                name: "Dev",
                command: "pnpm dev",
                ports: [{ id: "web", label: "Web", port: 70000 }],
              },
            ],
          },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it("resolves the hardcoded config for the mortgages repo, including literal env", () => {
    const config = repoApplicationConfigService.resolveApplicationConfig({
      name: "mortgages",
      remoteUrl: "git@github.com:opendoor-labs/mortgages.git",
      setupConfig: {},
    });

    const app = config.applications.find((candidate) => candidate.id === "mortgages");
    expect(app).toBeDefined();
    const web = app?.processes.find((candidate) => candidate.id === "web");
    expect(web?.ports[0]).toMatchObject({ port: 3000, defaultForwardingEnabled: true });
    expect(web?.env).toContainEqual({ key: "RAILS_ENV", value: "development" });
    expect(web?.env).toContainEqual({
      key: "SECRET_KEY_BASE",
      secretName: "MORTGAGES_SECRET_KEY_BASE",
    });
  });

  it("falls back to stored setupConfig for non-hardcoded repos", () => {
    const config = repoApplicationConfigService.resolveApplicationConfig({
      name: "some-other-repo",
      remoteUrl: "git@github.com:opendoor-labs/other.git",
      setupConfig: {
        applications: {
          applications: [
            {
              id: "web",
              name: "Web",
              processes: [
                { id: "dev", name: "Dev", command: "pnpm dev", ports: [] },
              ],
            },
          ],
        },
      },
    });

    expect(config.applications).toHaveLength(1);
    expect(config.applications[0].id).toBe("web");
  });

  it("drops literal env from the public projection but keeps secret refs", () => {
    const resolved = repoApplicationConfigService.resolveApplicationConfig({
      name: "mortgages",
      remoteUrl: "git@github.com:opendoor-labs/mortgages.git",
      setupConfig: {},
    });
    const publicConfig = repoApplicationConfigService.toPublicConfig(resolved);

    const web = publicConfig.applications[0].processes.find(
      (candidate) => candidate.id === "web",
    );
    expect(web?.env).toContainEqual({
      key: "SECRET_KEY_BASE",
      secretName: "MORTGAGES_SECRET_KEY_BASE",
    });
    for (const entry of web?.env ?? []) {
      expect(entry).toHaveProperty("secretName");
      expect(entry).not.toHaveProperty("value");
    }
  });
});
