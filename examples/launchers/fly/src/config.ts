export type ControllerConfig = {
  port: number;
  traceLauncherBearerToken: string;
  flyApiToken: string;
  flyAppName: string;
  flyRegion: string;
  traceRuntimeImage: string;
  flyMachineCpuKind: string;
  flyMachineCpus: number;
  flyMachineMemoryMb: number;
  deleteAfterStop: boolean;
  runtimePassthroughEnv: Record<string, string>;
};

const DEFAULT_PORT = 8787;

export function loadConfig(env: NodeJS.ProcessEnv): ControllerConfig {
  const required = [
    "TRACE_LAUNCHER_BEARER_TOKEN",
    "FLY_API_TOKEN",
    "FLY_APP_NAME",
    "FLY_REGION",
    "TRACE_RUNTIME_IMAGE",
  ] as const;

  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    port: parsePositiveInteger(env.PORT, DEFAULT_PORT, "PORT"),
    traceLauncherBearerToken: requireEnv(env, "TRACE_LAUNCHER_BEARER_TOKEN"),
    flyApiToken: requireEnv(env, "FLY_API_TOKEN"),
    flyAppName: requireEnv(env, "FLY_APP_NAME"),
    flyRegion: requireEnv(env, "FLY_REGION"),
    traceRuntimeImage: requireEnv(env, "TRACE_RUNTIME_IMAGE"),
    flyMachineCpuKind: env.FLY_MACHINE_CPU_KIND ?? "shared",
    flyMachineCpus: parsePositiveInteger(env.FLY_MACHINE_CPUS, 1, "FLY_MACHINE_CPUS"),
    flyMachineMemoryMb: parsePositiveInteger(
      env.FLY_MACHINE_MEMORY_MB,
      1024,
      "FLY_MACHINE_MEMORY_MB",
    ),
    deleteAfterStop: env.FLY_DELETE_AFTER_STOP !== "false",
    runtimePassthroughEnv: readRuntimePassthroughEnv(env),
  };
}

function readRuntimePassthroughEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const names = (env.TRACE_RUNTIME_PASSTHROUGH_ENV ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const output: Record<string, string> = {};

  for (const name of names) {
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
