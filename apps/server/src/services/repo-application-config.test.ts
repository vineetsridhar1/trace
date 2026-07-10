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

  it("rejects forwarding system ports", () => {
    expect(() =>
      repoApplicationConfigService.normalize({
        applications: [
          {
            id: "shell",
            name: "Shell",
            processes: [
              {
                id: "ssh",
                name: "SSH",
                command: "sshd",
                ports: [{ id: "ssh", label: "SSH", port: 22 }],
              },
            ],
          },
        ],
      }),
    ).toThrow("System and container-management ports cannot be forwarded");
  });
});
