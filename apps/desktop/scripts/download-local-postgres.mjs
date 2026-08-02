import path from "node:path";
import process from "node:process";
import { downloadBinaries } from "@boomship/postgres-vector-embedded";

const targetDir = process.argv[2];
if (!targetDir) {
  console.error("Usage: node download-local-postgres.mjs <target-directory>");
  process.exit(1);
}

await downloadBinaries({
  targetDir: path.resolve(targetDir),
  variant: "lite",
});
