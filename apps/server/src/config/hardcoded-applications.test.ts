import { describe, expect, it } from "vitest";
import { getHardcodedApplicationConfig } from "./hardcoded-applications.js";

describe("mortgages application config", () => {
  it("requires integration secrets and starts Pylon and AI workers", () => {
    const config = getHardcodedApplicationConfig({
      remoteUrl: "git@github.com:opendoor-labs/mortgages.git",
    });
    const application = config?.applications.find((candidate) => candidate.id === "mortgages");
    const pnpmInstall = config?.setupScripts.find((script) => script.id === "pnpm-install");
    const web = application?.processes.find((process) => process.id === "web");
    const sidekiq = application?.processes.find((process) => process.id === "sidekiq");
    const aiService = application?.processes.find((process) => process.id === "ai-service");

    expect(pnpmInstall?.command).toBe(
      "pnpm install --frozen-lockfile --filter mortgages-rails --filter ai-service",
    );
    expect(web?.env.filter((entry) => "secretName" in entry).map((entry) => entry.key)).toEqual(
      expect.arrayContaining([
        "PYLON_AUTH_DOMAIN",
        "PYLON_AUTH_CLIENT_ID",
        "PYLON_AUTH_CLIENT_SECRET",
        "PYLON_AUTH_AUDIENCE",
        "PYLON_GRAPHQL_API",
        "PLAID_CLIENT_ID",
        "PLAID_SECRET",
        "PLAID_TEMPLATE_ID",
        "TRUV_CLIENT_ID",
        "TRUV_CLIENT_SECRET",
        "SENTRY_DSN",
        "FRONTEND_SENTRY_DSN",
        "SLACK_ACCESS_TOKEN",
        "GRPC_SERVICE_TOKEN",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "AI_SERVICE_TOKEN",
        "MOS_AGENT_SHARED_SECRET",
        "MORTGAGE_RATES_API_TOKEN",
      ]),
    );
    expect(web?.env).toEqual(
      expect.arrayContaining([
        { key: "PYLON_SYNC_ENABLED", value: "true" },
        { key: "AI_CHAT_ENABLED", value: "true" },
        { key: "AI_DOCUMENT_VERIFICATION_ENABLED", value: "true" },
        { key: "LOX_GENERATION_ENABLED", value: "true" },
        { key: "MOS_AGENT_ENABLED", value: "true" },
        { key: "WORKFLOW_AGENT_CHECKPOINTS_ENABLED", value: "true" },
      ]),
    );
    expect(sidekiq).toEqual(
      expect.objectContaining({
        required: true,
        dependsOn: ["db-seed"],
      }),
    );
    expect(aiService).toEqual(
      expect.objectContaining({
        command: "pnpm --filter ai-service dev",
        required: true,
        dependsOn: ["pnpm-install"],
        env: expect.arrayContaining([
          { key: "AI_SERVICE_PORT", value: "3100" },
          { key: "MORTGAGE_GRAPHQL_URL", value: "http://localhost:3000/graphql/v1" },
          { key: "OPENAI_API_KEY", secretName: "OPENAI_API_KEY" },
          { key: "ANTHROPIC_API_KEY", secretName: "ANTHROPIC_API_KEY" },
          { key: "AI_SERVICE_TOKEN", secretName: "AI_SERVICE_TOKEN" },
        ]),
        ports: [expect.objectContaining({ port: 3100, healthPath: "/health" })],
      }),
    );
  });
});

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
