import { describe, expect, it } from "vitest";
import { getHardcodedApplicationConfig } from "./hardcoded-applications.js";

describe("code monorepo application config", () => {
  it("bootstraps full localdev and forwards its container preview listeners", () => {
    const config = getHardcodedApplicationConfig({
      remoteUrl: "git@github.com:opendoor-labs/code.git",
    });

    expect(config?.setupScripts).toEqual([
      expect.objectContaining({
        id: "container-bootstrap",
        command: "prepare-trace-code-checkout",
        env: [
          { key: "NPM_TOKEN", secretName: "NPM_TOKEN" },
          { key: "JFROG_USERNAME", secretName: "JFROG_USERNAME" },
          { key: "JFROG_PASSWORD", secretName: "JFROG_PASSWORD" },
          {
            key: "BUNDLE_ENTERPRISE__CONTRIBSYS__COM",
            secretName: "BUNDLE_ENTERPRISE__CONTRIBSYS__COM",
          },
          { key: "BUNDLE_GEM__FURY__IO", secretName: "BUNDLE_GEM__FURY__IO" },
        ],
      }),
    ]);

    expect(config?.applications).toEqual([
      expect.objectContaining({
        id: "localdev",
        processes: [
          expect.objectContaining({
            id: "dev-up",
            command: "direnv exec . scripts/bin/dev up 5000 --profile full --attach",
            required: true,
            dependsOn: ["container-bootstrap"],
            env: [
              { key: "NPM_TOKEN", secretName: "NPM_TOKEN" },
              { key: "JFROG_USERNAME", secretName: "JFROG_USERNAME" },
              { key: "JFROG_PASSWORD", secretName: "JFROG_PASSWORD" },
              {
                key: "BUNDLE_ENTERPRISE__CONTRIBSYS__COM",
                secretName: "BUNDLE_ENTERPRISE__CONTRIBSYS__COM",
              },
              { key: "BUNDLE_GEM__FURY__IO", secretName: "BUNDLE_GEM__FURY__IO" },
              { key: "ASDF_JAVA_VERSION", value: "temurin-17.0.17+10" },
              { key: "PGHOST", value: "127.0.0.1" },
              { key: "PGPORT", value: "5432" },
              { key: "PGDATABASE", value: "postgres" },
            ],
            ports: [
              expect.objectContaining({
                id: "web",
                port: 80,
                defaultForwardingEnabled: true,
                internalHostTemplate: "{sub}.5000.localhost",
              }),
            ],
          }),
        ],
      }),
    ]);
  });

  it("does not apply the code config to a similarly named repository", () => {
    expect(
      getHardcodedApplicationConfig({
        remoteUrl: "git@github.com:someone-else/code.git",
      }),
    ).toBeNull();
  });
});
