import { cp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const targetDir = process.argv[2];
if (!targetDir) {
  console.error("Usage: node download-local-postgres.mjs <target-directory>");
  process.exit(1);
}

if (process.platform !== "darwin" || !["arm64", "x64"].includes(process.arch)) {
  console.error(`Unsupported local PostgreSQL platform: ${process.platform}-${process.arch}`);
  process.exit(1);
}

const packageName = `@embedded-postgres/darwin-${process.arch}`;
const require = createRequire(import.meta.url);
const packageEntry = require.resolve(packageName);
const nativeRoot = path.resolve(path.dirname(packageEntry), "../native");
const resolvedTarget = path.resolve(targetDir);

await rm(resolvedTarget, { recursive: true, force: true });
await cp(nativeRoot, resolvedTarget, { recursive: true });

const links = JSON.parse(await readFile(path.join(nativeRoot, "pg-symlinks.json"), "utf8"));
for (const link of links) {
  const source = path.join(resolvedTarget, link.source.replace(/^native\//, ""));
  const target = path.join(resolvedTarget, link.target.replace(/^native\//, ""));
  await symlink(path.relative(path.dirname(target), source), target).catch((error) => {
    if (error?.code !== "EEXIST") throw error;
  });
}
await writeFile(path.join(resolvedTarget, ".trace-postgres-version"), "17.10.0\n");
