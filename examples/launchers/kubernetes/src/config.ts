export type ControllerConfig = {
  port: number;
  traceLauncherBearerToken: string;
  namespace: string;
  traceRuntimeImage: string;
  runtimeServiceAccount: string;
  runtimeCpuRequest: string;
  runtimeMemoryRequest: string;
  runtimeCpuLimit: string;
  runtimeMemoryLimit: string;
  runtimeImagePullSecretNames: string[];
  runtimeEnvSecretNames: string[];
  runtimePassthroughEnv: Record<string, string>;
};

const DEFAULT_PORT = 8787;

export function loadConfig(env: NodeJS.ProcessEnv): ControllerConfig {
  const required = ["TRACE_LAUNCHER_BEARER_TOKEN", "K8S_NAMESPACE", "TRACE_RUNTIME_IMAGE"] as const;

  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    port: parsePositiveInteger(env.PORT, DEFAULT_PORT, "PORT"),
    traceLauncherBearerToken: requireEnv(env, "TRACE_LAUNCHER_BEARER_TOKEN"),
    namespace: requireEnv(env, "K8S_NAMESPACE"),
    traceRuntimeImage: requireEnv(env, "TRACE_RUNTIME_IMAGE"),
    runtimeServiceAccount: env.TRACE_RUNTIME_SERVICE_ACCOUNT ?? "trace-runtime",
    runtimeCpuRequest: env.TRACE_RUNTIME_CPU_REQUEST ?? "1",
    runtimeMemoryRequest: env.TRACE_RUNTIME_MEMORY_REQUEST ?? "2Gi",
    runtimeCpuLimit: env.TRACE_RUNTIME_CPU_LIMIT ?? "4",
    runtimeMemoryLimit: env.TRACE_RUNTIME_MEMORY_LIMIT ?? "8Gi",
    runtimeImagePullSecretNames: readCsv(env.TRACE_RUNTIME_IMAGE_PULL_SECRET_NAMES),
    runtimeEnvSecretNames: readCsv(env.TRACE_RUNTIME_ENV_SECRET_NAMES),
    runtimePassthroughEnv: readRuntimePassthroughEnv(env),
  };
}

function readRuntimePassthroughEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const output: Record<string, string> = {};

  for (const name of readCsv(env.TRACE_RUNTIME_PASSTHROUGH_ENV)) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
      throw new Error(`TRACE_RUNTIME_PASSTHROUGH_ENV contains invalid env var name: ${name}`);
    }

    const value = env[name];
    if (value) {
      output[name] = value;
    }
  }

  return output;
}

function readCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}
