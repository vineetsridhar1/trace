import type {
  RepoApplicationDefinition,
  RepoEnvVar,
  RepoProcessDefinition,
  RepoSetupScript,
} from "@trace/gql";

// Internal fork: application configs are hardcoded here instead of being
// configured through the UI. Unlike the GraphQL RepoEnvVar (secret refs only),
// hardcoded env vars may also carry literal values for non-secret settings
// (ports, RAILS_ENV, local service URLs, etc.).
export type AppEnvVar = { key: string; value: string } | RepoEnvVar;

// `dependsOn` lists the step IDs a step waits on: a step only runs once every
// dependency has succeeded. The "run all" workflow starts an application and
// walks this graph. Dependencies reference setup script IDs or process IDs
// within the same application config (a single ID namespace across both).
export type AppSetupScript = Omit<RepoSetupScript, "env"> & { env: AppEnvVar[] };
export type AppProcessDefinition = Omit<RepoProcessDefinition, "env"> & { env: AppEnvVar[] };
export type AppDefinition = Omit<RepoApplicationDefinition, "processes"> & {
  processes: AppProcessDefinition[];
};

export interface HardcodedApplicationConfig {
  setupScripts: AppSetupScript[];
  applications: AppDefinition[];
}

export function isLiteralEnv(entry: AppEnvVar): entry is { key: string; value: string } {
  return "value" in entry;
}

// Backing services (Postgres, Redis) run at the runtime layer via
// start-trace-postgres / start-trace-redis, so the app config only models the
// application's own processes. The local Postgres listens on 127.0.0.1:5432 and
// Redis on 127.0.0.1:6379.
const MORTGAGES_BASE_ENV: AppEnvVar[] = [
  { key: "RAILS_ENV", value: "development" },
  // Override the runtime image default (app_development) so the app and its
  // migrations target the mortgages dev database on the local Postgres.
  { key: "DATABASE_URL", value: "postgres://postgres@127.0.0.1:5432/mortgages_development" },
  { key: "DB_HOST", value: "127.0.0.1" },
  { key: "DB_PORT", value: "5432" },
  { key: "PGUSER", value: "postgres" },
  { key: "REDIS_URL", value: "redis://127.0.0.1:6379/0" },
];

// Secrets are provisioned as org secrets and referenced by name. These are the
// minimum required for the app to boot; integration creds (Pylon/Plaid/Truv)
// can be added here as additional secret refs if a flow needs them.
const MORTGAGES_SECRET_ENV: AppEnvVar[] = [
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
      command: "pnpm install --frozen-lockfile --filter mortgages-rails",
      workingDirectory: ".",
      dependsOn: [],
      env: [...MORTGAGES_NPM_ENV],
    },
    {
      id: "db-setup",
      name: "Create database & load schema",
      command: "bin/rails db:create db:schema:load",
      workingDirectory: ".",
      // Needs gems installed to run the rails CLI.
      dependsOn: ["bundle-install"],
      env: [...MORTGAGES_BASE_ENV, ...MORTGAGES_SECRET_ENV],
    },
    {
      id: "db-seed",
      name: "Seed database",
      command: "bin/rails db:seed",
      workingDirectory: ".",
      // Seeds load into the schema created by db-setup.
      dependsOn: ["db-setup"],
      env: [...MORTGAGES_BASE_ENV, ...MORTGAGES_SECRET_ENV],
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
      env: [],
    },
  ],
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
            ...MORTGAGES_SECRET_ENV,
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
          dependsOn: ["pnpm-install"],
          env: [
            { key: "NODE_ENV", value: "development" },
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
          required: false,
          dependsOn: ["db-seed"],
          env: [...MORTGAGES_BASE_ENV, ...MORTGAGES_SECRET_ENV, MORTGAGES_JEMALLOC_ENV],
          ports: [],
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
];

export function getHardcodedApplicationConfig(repo: {
  name?: string | null;
  remoteUrl?: string | null;
}): HardcodedApplicationConfig | null {
  return HARDCODED_CONFIGS.find((entry) => entry.matches(repo))?.config ?? null;
}
