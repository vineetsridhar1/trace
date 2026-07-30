import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(packageDir, "runtime-cli", "trace.mjs");
const outputPath = path.join(packageDir, "src", "trace-cli.generated.ts");
const source = fs.readFileSync(sourcePath, "utf8");

fs.writeFileSync(
  outputPath,
  `// Generated from packages/shared/runtime-cli/trace.mjs. Do not edit by hand.\nexport const TRACE_CLI_SOURCE = ${JSON.stringify(source)};\n`,
);
