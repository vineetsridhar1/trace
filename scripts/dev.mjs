import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const nodeCommand = process.execPath;
const defaultWebPort = 3000;
const defaultApiPort = 4000;
const defaultProdUrl = "https://gettrace.org";
const command = process.argv[2];
const args = process.argv.slice(3);
const forwardedArgs = [];
const managedChildren = new Set();
let portFlagValue = null;
let shuttingDown = false;

function usage() {
  console.error("Usage:");
  console.error("  pnpm dev -- [--port <web-port>]");
  console.error("  pnpm dev:local -- [--port <web-port>]");
  console.error("  pnpm dev:web -- [--port <web-port>]");
  console.error("  pnpm dev:server -- [--port <web-port>]");
  console.error("  pnpm dev:desktop -- [--port <web-port>]");
  console.error("  pnpm dev:web:prod -- [--port <web-port>]");
  console.error("  pnpm dev:desktop:prod -- [--port <web-port>]");
  console.error("  pnpm dev:desktop:prod-web -- [--port <web-port>]");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseInteger(value, label) {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return Number(value);
}

function validatePort(value, label) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${label} must be between 1 and 65535; received ${value}`);
  }
}

function parseWebPort(value) {
  const port = parseInteger(value, "port");
  validatePort(port, "Web port");
  return port;
}

function parseArgs() {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }

    if (arg === "--port" || arg === "-p") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--port requires a value");
      }
      portFlagValue = parseWebPort(value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--port=")) {
      portFlagValue = parseWebPort(arg.slice("--port=".length));
      continue;
    }

    forwardedArgs.push(arg);
  }
}

function resolvePorts() {
  if (portFlagValue != null) {
    return {
      explicitPort: true,
      offset: portFlagValue - defaultWebPort,
      webPort: portFlagValue,
      apiPort: portFlagValue + (defaultApiPort - defaultWebPort),
    };
  }

  const offset = process.env.TRACE_PORT ? parseInteger(process.env.TRACE_PORT, "TRACE_PORT") : 0;
  const webPort = defaultWebPort + offset;
  const apiPort = defaultApiPort + offset;
  validatePort(webPort, "Web port");

  return {
    explicitPort: false,
    offset,
    webPort,
    apiPort,
  };
}

function validateApiPort(ports) {
  validatePort(ports.apiPort, "API port");
}

function validateLocalModePorts(ports) {
  validateApiPort(ports);
  validatePort(5690 + ports.offset, "Prisma dev server port");
  validatePort(5691 + ports.offset, "Prisma database port");
  validatePort(5692 + ports.offset, "Prisma shadow database port");
}

function withForwardedArgs(spawnArgs, extraArgs = []) {
  const scriptArgs = [...extraArgs, ...forwardedArgs];
  if (scriptArgs.length === 0) return spawnArgs;
  return [...spawnArgs, ...scriptArgs];
}

function spawnChild(spawnArgs, env) {
  const child = spawn(spawnArgs[0], spawnArgs.slice(1), {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error("[trace-dev] failed to start dev command:", error);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    if (code != null && code < 0) {
      console.error(`[trace-dev] dev command exited with code ${code}`);
      process.exitCode = 1;
      return;
    }
    process.exitCode = code ?? 0;
  });
}

function spawnManagedChild(label, spawnArgs, env) {
  const child = spawn(spawnArgs[0], spawnArgs.slice(1), {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    stdio: "inherit",
  });
  managedChildren.add(child);

  child.on("error", (error) => {
    if (shuttingDown) return;
    console.error(`[trace-dev] failed to start ${label}:`, error);
    void shutdownManagedChildren(1);
  });

  child.on("exit", (code, signal) => {
    managedChildren.delete(child);
    if (shuttingDown) return;

    if (signal) {
      console.error(`[trace-dev] ${label} exited from signal ${signal}`);
      void shutdownManagedChildren(1);
      return;
    }

    if (code !== 0) {
      console.error(`[trace-dev] ${label} exited with code ${code ?? 1}`);
      void shutdownManagedChildren(code ?? 1);
      return;
    }

    void shutdownManagedChildren(0);
  });

  return child;
}

async function shutdownManagedChildren(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of managedChildren) {
    child.kill("SIGTERM");
  }

  await sleep(1_000);

  for (const child of managedChildren) {
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }

  process.exit(exitCode);
}

async function waitForHttp(url, label) {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(3_000),
      });
      const body = await response.text();
      if (response.ok && body.includes("<title>Trace</title>")) {
        return;
      }
    } catch {
      // Retry until the dev server finishes starting.
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

function baseLocalEnv(ports) {
  return {
    TRACE_PORT: String(ports.offset),
    ...(ports.explicitPort || (!process.env.PORT && process.env.TRACE_PORT)
      ? { PORT: String(ports.apiPort) }
      : {}),
  };
}

function localServerEnv(ports) {
  const webUrl = `http://localhost:${ports.webPort}`;
  return {
    ...baseLocalEnv(ports),
    TRACE_WEB_URL:
      ports.explicitPort || !process.env.TRACE_WEB_URL ? webUrl : process.env.TRACE_WEB_URL,
  };
}

function localDesktopEnv(ports) {
  const serverUrl = `http://localhost:${ports.apiPort}`;
  const webUrl = `http://localhost:${ports.webPort}`;
  return {
    ...baseLocalEnv(ports),
    TRACE_SERVER_URL:
      ports.explicitPort || !process.env.TRACE_SERVER_URL
        ? serverUrl
        : process.env.TRACE_SERVER_URL,
    TRACE_WEB_URL:
      ports.explicitPort || !process.env.TRACE_WEB_URL ? webUrl : process.env.TRACE_WEB_URL,
  };
}

function prodServerEnv() {
  return {
    TRACE_SERVER_URL: process.env.TRACE_SERVER_URL ?? defaultProdUrl,
  };
}

function prodLocalWebEnv(ports) {
  return {
    ...baseLocalEnv(ports),
    VITE_API_URL: process.env.VITE_API_URL ?? defaultProdUrl,
  };
}

function prodLocalWebDesktopEnv(ports) {
  return {
    ...prodServerEnv(),
    TRACE_WEB_URL: `http://localhost:${ports.webPort}`,
  };
}

function prodHostedWebDesktopEnv() {
  return {
    TRACE_SERVER_URL: defaultProdUrl,
    TRACE_WEB_URL: defaultProdUrl,
  };
}

async function runDesktopProdWithLocalWeb(ports) {
  const webEnv = prodLocalWebEnv(ports);
  const desktopEnv = prodLocalWebDesktopEnv(ports);
  const webUrl = `http://localhost:${ports.webPort}`;

  console.log(`[trace-dev] VITE_API_URL=${webEnv.VITE_API_URL}`);
  console.log(`[trace-dev] web URL=${webUrl}`);
  console.log(`[trace-dev] TRACE_SERVER_URL=${desktopEnv.TRACE_SERVER_URL}`);
  console.log(`[trace-dev] TRACE_WEB_URL=${desktopEnv.TRACE_WEB_URL}`);

  spawnManagedChild(
    "web",
    withForwardedArgs([pnpmCommand, "--filter", "@trace/web", "dev"], ["--strictPort"]),
    webEnv,
  );
  await waitForHttp(webUrl, "prod web app");
  spawnManagedChild("desktop", [pnpmCommand, "--filter", "@trace/desktop", "dev"], desktopEnv);
}

process.on("SIGINT", () => {
  void shutdownManagedChildren(0);
});

process.on("SIGTERM", () => {
  void shutdownManagedChildren(0);
});

async function main() {
  parseArgs();
  const ports = resolvePorts();

  switch (command) {
    case "all": {
      validateLocalModePorts(ports);
      const env = {
        ...localDesktopEnv(ports),
        ...localServerEnv(ports),
      };
      console.log(`[trace-dev] web URL=http://localhost:${ports.webPort}`);
      console.log(`[trace-dev] API URL=http://localhost:${ports.apiPort}`);
      spawnChild(withForwardedArgs([pnpmCommand, "-r", "--parallel", "dev"]), env);
      break;
    }
    case "local": {
      validateLocalModePorts(ports);
      const env = {
        ...localDesktopEnv(ports),
        ...localServerEnv(ports),
      };
      console.log(`[trace-dev] web URL=http://localhost:${ports.webPort}`);
      console.log(`[trace-dev] API URL=http://localhost:${ports.apiPort}`);
      spawnChild([nodeCommand, "./scripts/dev-local.mjs", ...forwardedArgs], env);
      break;
    }
    case "web": {
      validateApiPort(ports);
      console.log(`[trace-dev] web URL=http://localhost:${ports.webPort}`);
      spawnChild(withForwardedArgs([pnpmCommand, "--filter", "@trace/web", "dev"]), {
        ...baseLocalEnv(ports),
      });
      break;
    }
    case "server": {
      validateApiPort(ports);
      console.log(`[trace-dev] API URL=http://localhost:${ports.apiPort}`);
      spawnChild(withForwardedArgs([pnpmCommand, "--filter", "@trace/server", "dev"]), {
        ...localServerEnv(ports),
      });
      break;
    }
    case "desktop": {
      validateApiPort(ports);
      const env = localDesktopEnv(ports);
      console.log(`[trace-dev] TRACE_SERVER_URL=${env.TRACE_SERVER_URL}`);
      console.log(`[trace-dev] TRACE_WEB_URL=${env.TRACE_WEB_URL}`);
      spawnChild(withForwardedArgs([pnpmCommand, "--filter", "@trace/desktop", "dev"]), env);
      break;
    }
    case "web-prod": {
      validateApiPort(ports);
      const env = prodLocalWebEnv(ports);
      console.log(`[trace-dev] VITE_API_URL=${env.VITE_API_URL}`);
      console.log(`[trace-dev] web URL=http://localhost:${ports.webPort}`);
      spawnChild(withForwardedArgs([pnpmCommand, "--filter", "@trace/web", "dev"]), env);
      break;
    }
    case "desktop-prod": {
      await runDesktopProdWithLocalWeb(ports);
      break;
    }
    case "desktop-prod-web": {
      const env = prodHostedWebDesktopEnv();
      if (ports.explicitPort) {
        console.warn("[trace-dev] --port is ignored by dev:desktop:prod-web; loading hosted web");
      }
      console.log(`[trace-dev] TRACE_SERVER_URL=${env.TRACE_SERVER_URL}`);
      console.log(`[trace-dev] TRACE_WEB_URL=${env.TRACE_WEB_URL}`);
      spawnChild(withForwardedArgs([pnpmCommand, "--filter", "@trace/desktop", "dev"]), env);
      break;
    }
    default:
      usage();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[trace-dev] ${formatError(error)}`);
  if (managedChildren.size > 0) {
    void shutdownManagedChildren(1);
    return;
  }
  usage();
  process.exit(1);
});
