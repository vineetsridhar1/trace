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

// Private @opendoor JS packages resolve from npmjs with this token (see the
// repo's committed .npmrc, which expands ${NPM_TOKEN}).
const MORTGAGES_NPM_ENV: AppEnvVar[] = [{ key: "NPM_TOKEN", secretName: "MORTGAGES_NPM_TOKEN" }];

// jemalloc cuts Ruby RSS substantially, matching the app's production image.
const MORTGAGES_JEMALLOC_ENV: AppEnvVar = { key: "LD_PRELOAD", value: "libjemalloc.so.2" };

// The Vite/asset build is memory-hungry on this RN-web codebase.
const MORTGAGES_NODE_BUILD_MEMORY_ENV: AppEnvVar = {
  key: "NODE_OPTIONS",
  value: "--max-old-space-size=4096",
};

const MORTGAGES_APPLICATION_CONFIG: HardcodedApplicationConfig = {
  setupScripts: [
    {
      id: "bundle-install",
      name: "Install gems (bundle install)",
      command: "bundle install",
      workingDirectory: ".",
      env: [],
    },
    {
      id: "yarn-install",
      name: "Install JS deps (yarn install)",
      // Rewrite locked registry URLs to npmjs so private @opendoor packages
      // resolve with NPM_TOKEN auth (mirrors the app's deploy build).
      command:
        "sed -i 's#https://registry.yarnpkg.com/#https://registry.npmjs.org/#g' yarn.lock && yarn install --frozen-lockfile",
      workingDirectory: ".",
      env: [...MORTGAGES_NPM_ENV],
    },
    {
      id: "db-setup",
      name: "Create, migrate & seed database",
      command: "bin/rails db:prepare",
      workingDirectory: ".",
      env: [...MORTGAGES_BASE_ENV, ...MORTGAGES_SECRET_ENV],
    },
    {
      id: "assets-build",
      name: "Build CSS & JS assets",
      command: "yarn build:css && bin/vite build",
      workingDirectory: ".",
      env: [...MORTGAGES_BASE_ENV, ...MORTGAGES_NPM_ENV, MORTGAGES_NODE_BUILD_MEMORY_ENV],
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
          env: [
            ...MORTGAGES_BASE_ENV,
            ...MORTGAGES_SECRET_ENV,
            { key: "PORT", value: "3000" },
            { key: "RAILS_SERVE_STATIC_FILES", value: "true" },
            MORTGAGES_VITE_PORT_ENV,
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
          required: false,
          env: [
            { key: "NODE_ENV", value: "development" },
            MORTGAGES_VITE_PORT_ENV,
            MORTGAGES_NODE_BUILD_MEMORY_ENV,
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
    matches: (repo) => {
      const remote = (repo.remoteUrl ?? "").toLowerCase();
      const name = (repo.name ?? "").toLowerCase();
      return remote.includes("opendoor-labs/mortgages") || name === "mortgages";
    },
    config: MORTGAGES_APPLICATION_CONFIG,
  },
];

export function getHardcodedApplicationConfig(repo: {
  name?: string | null;
  remoteUrl?: string | null;
}): HardcodedApplicationConfig | null {
  return HARDCODED_CONFIGS.find((entry) => entry.matches(repo))?.config ?? null;
}
