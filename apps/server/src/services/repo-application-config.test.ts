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

  it("rejects invalid ports and non-string env values", () => {
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
                env: { PORT: 3000 },
                ports: [{ id: "web", label: "Web", port: 70000 }],
              },
            ],
          },
        ],
      }),
    ).toThrow(ValidationError);
  });
});
