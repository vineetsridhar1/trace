import type {
  RepoApplicationDefinition,
  RepoEnvVar,
  RepoPortDefinition,
  RepoProcessDefinition,
  RepoRunScript,
  RepoSetupScript,
} from "@trace/gql";

// Internal fork: application configs are hardcoded here instead of being
// configured through the UI. Unlike the GraphQL RepoEnvVar (secret refs only),
// hardcoded env vars may also carry literal values for non-secret settings or
// values derived from the active session (ports, owner identity, service URLs).
export type AppEnvVar =
  | { key: string; value: string }
  | RepoEnvVar
  | { key: string; sessionValue: "ownerEmail" };

// `dependsOn` lists the step IDs a step waits on: a step only runs once every
// dependency has succeeded. The "run all" workflow starts an application and
// walks this graph. Dependencies reference setup script IDs or process IDs
// within the same application config (a single ID namespace across both).
export type AppSetupScript = Omit<RepoSetupScript, "env"> & { env: AppEnvVar[] };
// Hardcoded ports may set internalHostTemplate for host-routed containers (one
// edge listener serving many hostnames): requests to `<sub>--<key>` preview
// hosts are forwarded with Host rewritten to the template's `{sub}` expansion.
export type AppPortDefinition = RepoPortDefinition & {
  internalHostTemplate?: string;
  sharedCookieDomain?: boolean;
};
export type AppProcessDefinition = Omit<RepoProcessDefinition, "env" | "ports"> & {
  env: AppEnvVar[];
  ports: AppPortDefinition[];
};
export type AppDefinition = Omit<RepoApplicationDefinition, "processes"> & {
  processes: AppProcessDefinition[];
};

export interface HardcodedApplicationConfig {
  setupScripts: AppSetupScript[];
  runScripts: RepoRunScript[];
  applications: AppDefinition[];
}

export const DEFAULT_APP_SESSION_CONFIG: HardcodedApplicationConfig = {
  setupScripts: [],
  runScripts: [],
  applications: [
    {
      id: "app",
      name: "App",
      processes: [
        {
          id: "dev",
          name: "Dev server",
          command: "pnpm install --prefer-offline && pnpm dev",
          workingDirectory: ".",
          required: true,
          dependsOn: [],
          env: [],
          ports: [
            {
              id: "web",
              label: "Preview",
              port: 3000,
              protocol: "http",
              defaultForwardingEnabled: true,
              healthPath: "/",
            },
          ],
        },
      ],
    },
  ],
};

export function isLiteralEnv(entry: AppEnvVar): entry is { key: string; value: string } {
  return "value" in entry;
}

export function isSecretEnv(entry: AppEnvVar): entry is RepoEnvVar {
  return "secretName" in entry;
}

export function isSessionEnv(
  entry: AppEnvVar,
): entry is { key: string; sessionValue: "ownerEmail" } {
  return "sessionValue" in entry;
}

// Backing services (Postgres, Redis) run at the runtime layer via
// start-trace-postgres / start-trace-redis, so the app config only models the
// application's own processes. The local Postgres listens on 127.0.0.1:5432 and
// Redis on 127.0.0.1:6379.
// Pin to the runtime image's default database so the Rails server, its
// migrations, and ad-hoc `rails runner`/shell sessions (which inherit the
// container's ambient DATABASE_URL) all share one DB. Otherwise records created
// from a runner land in a database the server never queries.
const MORTGAGES_DATABASE_URL_ENV: AppEnvVar = {
  key: "DATABASE_URL",
  value: "postgres://postgres@127.0.0.1:5432/app_development",
};

const MORTGAGES_BASE_ENV: AppEnvVar[] = [
  { key: "RAILS_ENV", value: "development" },
  MORTGAGES_DATABASE_URL_ENV,
  { key: "DB_HOST", value: "127.0.0.1" },
  { key: "DB_PORT", value: "5432" },
  { key: "PGUSER", value: "postgres" },
  { key: "REDIS_URL", value: "redis://127.0.0.1:6379/0" },
  { key: "PLAID_ENV", value: "sandbox" },
  { key: "TRUV_ENV", value: "sandbox" },
  { key: "PYLON_SYNC_ENABLED", value: "true" },
  {
    key: "WEB_API_URL",
    value: "http://web-internal-api-http-server-nginx-vpn-http.apps-staging.internal.opendoor.com",
  },
  { key: "ALLOWED_ORIGINS", value: "http://localhost:3000" },
  { key: "AI_CHAT_ENABLED", value: "true" },
  { key: "AI_DOCUMENT_VERIFICATION_ENABLED", value: "true" },
  { key: "AI_QUESTION_SUGGESTIONS_ENABLED", value: "true" },
  { key: "AI_CHAT_AOPS_ENABLED", value: "true" },
  { key: "AI_CHAT_AOP_INJECTION_ENABLED", value: "true" },
  { key: "AI_CHAT_WIKI_TOOLS_ENABLED", value: "true" },
  { key: "AI_VERIFICATION_GUIDELINE_ASSISTANT_ENABLED", value: "true" },
  { key: "LOX_GENERATION_ENABLED", value: "true" },
  { key: "PATHS_TO_QUALIFY_ENABLED", value: "true" },
  { key: "PATHS_TO_QUALIFY_ROLLOUT_MODE", value: "all" },
  { key: "OPENDOOR_MIOS_DATA_ENABLED", value: "true" },
  { key: "AI_SERVICE_URL", value: "http://localhost:3100" },
  { key: "MOS_AGENT_URL", value: "http://localhost:3100" },
  { key: "MOS_AGENT_ENABLED", value: "true" },
  { key: "MORTGAGE_OS_ASSISTANT_MODEL", value: "gpt-5.6-sol" },
  { key: "MORTGAGE_OS_ASSISTANT_REASONING_EFFORT", value: "medium" },
  { key: "WORKFLOW_AGENT_CHECKPOINTS_ENABLED", value: "true" },
  { key: "RAILS_INTERNAL_URL", value: "http://localhost:3000" },
  { key: "AI_EMBEDDING_MODEL", value: "text-embedding-3-small" },
  { key: "AI_EMBEDDING_DIMENSIONS", value: "1536" },
  { key: "AI_QUESTION_SUGGESTIONS_MODEL", value: "claude-sonnet-4-6" },
];

// Secrets are provisioned as app-scoped org secrets and referenced by name.
// Keep each set attached only to the processes that consume it.
const MORTGAGES_RAILS_SECRET_ENV: AppEnvVar[] = [
  { key: "SECRET_KEY_BASE", secretName: "MORTGAGES_SECRET_KEY_BASE" },
  {
    key: "ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY",
    secretName: "MORTGAGES_AR_ENCRYPTION_PRIMARY_KEY",
  },
  {
    key: "ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY",
    secretName: "MORTGAGES_AR_ENCRYPTION_DETERMINISTIC_KEY",
  },
  {
    key: "ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT",
    secretName: "MORTGAGES_AR_ENCRYPTION_KEY_DERIVATION_SALT",
  },
];

const MORTGAGES_PYLON_SECRET_ENV: AppEnvVar[] = [
  { key: "PYLON_AUTH_DOMAIN", secretName: "MORTGAGES_PYLON_AUTH_DOMAIN" },
  { key: "PYLON_AUTH_CLIENT_ID", secretName: "MORTGAGES_PYLON_AUTH_CLIENT_ID" },
  { key: "PYLON_AUTH_CLIENT_SECRET", secretName: "MORTGAGES_PYLON_AUTH_CLIENT_SECRET" },
  { key: "PYLON_AUTH_AUDIENCE", secretName: "MORTGAGES_PYLON_AUTH_AUDIENCE" },
  { key: "PYLON_GRAPHQL_API", secretName: "MORTGAGES_PYLON_GRAPHQL_API" },
];

const MORTGAGES_RAILS_AI_SECRET_ENV: AppEnvVar[] = [
  { key: "AI_SERVICE_TOKEN", secretName: "MORTGAGES_AI_SERVICE_TOKEN" },
  { key: "MOS_AGENT_SHARED_SECRET", secretName: "MORTGAGES_AI_SERVICE_TOKEN" },
];

const MORTGAGES_AI_SERVICE_ENV: AppEnvVar[] = [
  { key: "AI_SERVICE_PORT", value: "3100" },
  { key: "RAILS_INTERNAL_URL", value: "http://localhost:3000" },
  { key: "MORTGAGE_GRAPHQL_URL", value: "http://localhost:3000/graphql/v1" },
  { key: "VERIFICATION_ALLOWED_FILE_HOSTS", value: "http://localhost:3000" },
  { key: "AI_TRANSCRIBE_MODEL", value: "whisper-1" },
  { key: "AI_EMBEDDING_MODEL", value: "text-embedding-3-small" },
  { key: "ANTHROPIC_OPUS_MODEL", value: "claude-opus-4-7" },
  { key: "ANTHROPIC_VERIFICATION_MODEL", value: "claude-opus-5" },
  { key: "ANTHROPIC_QUESTION_SUGGESTIONS_MODEL", value: "claude-sonnet-4-6" },
  { key: "ANTHROPIC_AOP_SELECTOR_MODEL", value: "claude-haiku-4-5" },
  { key: "OPENAI_API_KEY", secretName: "MORTGAGES_OPENAI_API_KEY" },
  { key: "ANTHROPIC_API_KEY", secretName: "MORTGAGES_ANTHROPIC_API_KEY" },
  { key: "AI_SERVICE_TOKEN", secretName: "MORTGAGES_AI_SERVICE_TOKEN" },
  { key: "MOS_AGENT_SHARED_SECRET", secretName: "MORTGAGES_AI_SERVICE_TOKEN" },
];

const MORTGAGES_VITE_PORT_ENV: AppEnvVar = { key: "VITE_RUBY_PORT", value: "3036" };

// Pin the dev server to IPv4 loopback. Vite's default "localhost" bind resolves
// to IPv6 ::1 in the runner, but vite_ruby's in-Rails dev-server proxy connects
// over IPv4 127.0.0.1 — the mismatch makes Rails treat the dev server as down
// and serve raw .tsx off disk instead of proxying. Setting VITE_RUBY_HOST aligns
// both the Vite bind and the proxy target on 127.0.0.1.
const MORTGAGES_VITE_HOST_ENV: AppEnvVar = { key: "VITE_RUBY_HOST", value: "127.0.0.1" };

// Private @opendoor JS packages resolve from npmjs with this token (see the
// repo's committed .npmrc, which expands ${NPM_TOKEN}).
const MORTGAGES_NPM_ENV: AppEnvVar[] = [{ key: "NPM_TOKEN", secretName: "MORTGAGES_NPM_TOKEN" }];

// jemalloc cuts Ruby RSS substantially, matching the app's production image.
const MORTGAGES_JEMALLOC_ENV: AppEnvVar = { key: "LD_PRELOAD", value: "libjemalloc.so.2" };

// Cap the Vite dev server's heap so it coexists with Postgres/Redis/Ruby in the
// runner's memory budget rather than ballooning toward an OOM kill.
const MORTGAGES_NODE_MEMORY_ENV: AppEnvVar = {
  key: "NODE_OPTIONS",
  value: "--max-old-space-size=2048",
};

const MORTGAGES_APPLICATION_CONFIG: HardcodedApplicationConfig = {
  setupScripts: [
    {
      id: "bundle-install",
      name: "Install gems (bundle install)",
      command: "bundle install",
      workingDirectory: ".",
      dependsOn: [],
      env: [],
    },
    {
      id: "pnpm-install",
      name: "Install JS deps (pnpm install)",
      // Private @opendoor packages resolve with NPM_TOKEN auth via the repo's
      // committed .npmrc (mirrors the app's deploy build).
      command: "pnpm install --frozen-lockfile --filter mortgages-rails --filter ai-service",
      workingDirectory: ".",
      dependsOn: [],
      env: [...MORTGAGES_NPM_ENV],
    },
    {
      id: "db-setup",
      name: "Create database & run migrations",
      command: "bin/rails db:create db:migrate",
      workingDirectory: ".",
      // Needs gems installed to run the rails CLI.
      dependsOn: ["bundle-install"],
      env: [...MORTGAGES_BASE_ENV, ...MORTGAGES_RAILS_SECRET_ENV],
    },
    {
      id: "db-seed",
      name: "Seed database",
      command: "bin/rails db:seed",
      workingDirectory: ".",
      // Seeds load into the schema created by db-setup.
      dependsOn: ["db-setup"],
      env: [...MORTGAGES_BASE_ENV, ...MORTGAGES_RAILS_SECRET_ENV],
    },
    {
      id: "assets-build",
      name: "Build CSS assets",
      // JS is served by the Vite dev server through Rails' dev proxy, so only
      // the Tailwind CSS bundle needs a one-time build here.
      command: "pnpm build:css",
      workingDirectory: ".",
      // Needs JS deps installed.
      dependsOn: ["pnpm-install"],
      env: [...MORTGAGES_NPM_ENV],
    },
  ],
  runScripts: [],
  applications: [
    {
      id: "mortgages",
      name: "Mortgages",
      processes: [
        {
          id: "web",
          name: "Rails server",
          command: "bin/rails server -b 0.0.0.0 -p 3000",
          workingDirectory: ".",
          required: true,
          // Boot only once the DB is seeded and CSS is built.
          dependsOn: ["db-seed", "assets-build"],
          env: [
            ...MORTGAGES_BASE_ENV,
            ...MORTGAGES_RAILS_SECRET_ENV,
            ...MORTGAGES_PYLON_SECRET_ENV,
            ...MORTGAGES_RAILS_AI_SECRET_ENV,
            { key: "PORT", value: "3000" },
            MORTGAGES_VITE_PORT_ENV,
            MORTGAGES_VITE_HOST_ENV,
            MORTGAGES_JEMALLOC_ENV,
          ],
          ports: [
            {
              id: "http",
              label: "Rails (HTTP)",
              port: 3000,
              protocol: "http",
              defaultForwardingEnabled: true,
              healthPath: "/up",
            },
          ],
        },
        {
          id: "vite",
          name: "Vite dev server",
          command: "bin/vite dev",
          workingDirectory: ".",
          // Required: in development Rails proxies asset requests to this dev
          // server, so the web page only renders correctly when it is running.
          required: true,
          dependsOn: ["pnpm-install", "bundle-install"],
          env: [
            { key: "NODE_ENV", value: "development" },
            MORTGAGES_DATABASE_URL_ENV,
            MORTGAGES_VITE_PORT_ENV,
            MORTGAGES_VITE_HOST_ENV,
            MORTGAGES_NODE_MEMORY_ENV,
            ...MORTGAGES_NPM_ENV,
          ],
          ports: [
            {
              id: "vite",
              label: "Vite dev server",
              port: 3036,
              protocol: "http",
              defaultForwardingEnabled: false,
              healthPath: null,
            },
          ],
        },
        {
          id: "sidekiq",
          name: "Sidekiq worker",
          command: "bundle exec sidekiq -C config/sidekiq.yml",
          workingDirectory: ".",
          // Pylon inbound/outbound syncs are Sidekiq queues, so the app is not
          // fully running when this process is absent.
          required: true,
          dependsOn: ["db-seed"],
          env: [
            ...MORTGAGES_BASE_ENV,
            ...MORTGAGES_RAILS_SECRET_ENV,
            ...MORTGAGES_PYLON_SECRET_ENV,
            ...MORTGAGES_RAILS_AI_SECRET_ENV,
            MORTGAGES_JEMALLOC_ENV,
          ],
          ports: [],
        },
        {
          id: "ai-service",
          name: "AI service",
          command: "pnpm --filter ai-service dev",
          workingDirectory: ".",
          required: true,
          dependsOn: ["pnpm-install"],
          env: MORTGAGES_AI_SERVICE_ENV,
          ports: [
            {
              id: "ai-service",
              label: "AI service",
              port: 3100,
              protocol: "http",
              defaultForwardingEnabled: false,
              healthPath: "/health",
            },
          ],
        },
      ],
    },
  ],
};

const CODE_APPLICATION_CONFIG: HardcodedApplicationConfig = {
  setupScripts: [
    {
      id: "container-bootstrap",
      name: "Prepare code monorepo",
      command: "prepare-trace-code-checkout",
      workingDirectory: ".",
      dependsOn: [],
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
    },
  ],
  runScripts: [],
  applications: [
    {
      id: "localdev",
      name: "Code localdev",
      processes: [
        {
          id: "dev-up",
          name: "Full localdev",
          // --attach keeps dev up alive as the run's supervisor: without it the
          // command exits once services are ready (process-compose runs
          // detached), which reads as the app exiting and drops forwarding.
          command: "direnv exec . scripts/bin/dev up 5000 --profile full --attach",
          workingDirectory: ".",
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
            { key: "CURRENT_USER_EMAIL", sessionValue: "ownerEmail" },
            { key: "ODFE_CURRENT_USER_EMAIL", sessionValue: "ownerEmail" },
          ],
          // Localdev is hostname-routed: one Caddy edge on container port 80
          // serves www/consumer/sell/buy/opshub.5000.localhost. A single
          // host-mode endpoint covers all of them via `<sub>--<key>` preview
          // hosts instead of one port-mode endpoint per app.
          ports: [
            {
              id: "web",
              label: "Localdev",
              port: 80,
              protocol: "http",
              defaultForwardingEnabled: true,
              healthPath: "/",
              internalHostTemplate: "{sub}.5000.localhost",
              sharedCookieDomain: true,
            },
          ],
        },
      ],
    },
  ],
};

const HARDCODED_CONFIGS: Array<{
  matches: (repo: { name?: string | null; remoteUrl?: string | null }) => boolean;
  config: HardcodedApplicationConfig;
}> = [
  {
    // Match on the remote (handles git@github.com:... and https://github.com/...
    // with or without a trailing .git) rather than the display name, which a
    // user could set on an unrelated repo.
    matches: (repo) => /[/:]opendoor-labs\/mortgages(\.git)?$/i.test(repo.remoteUrl ?? ""),
    config: MORTGAGES_APPLICATION_CONFIG,
  },
  {
    matches: (repo) => /[/:]opendoor-labs\/code(\.git)?$/i.test(repo.remoteUrl ?? ""),
    config: CODE_APPLICATION_CONFIG,
  },
];

export function getHardcodedApplicationConfig(repo: {
  name?: string | null;
  remoteUrl?: string | null;
}): HardcodedApplicationConfig | null {
  return HARDCODED_CONFIGS.find((entry) => entry.matches(repo))?.config ?? null;
}
