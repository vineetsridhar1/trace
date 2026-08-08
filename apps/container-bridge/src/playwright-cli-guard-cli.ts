import { spawn } from "node:child_process";
import { guardedPlaywrightArgs } from "./playwright-cli-guard.js";

function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`playwright-cli: ${message}\n`);
  process.exit(2);
}

let invocation: ReturnType<typeof guardedPlaywrightArgs>;
try {
  invocation = guardedPlaywrightArgs(process.argv.slice(2), process.env);
} catch (error) {
  fail(error);
}

const child = spawn(invocation.rawExecutable, invocation.args, {
  env: process.env,
  stdio: "inherit",
});
child.once("error", fail);
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
