import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const serverRoot = process.argv[2];
if (!serverRoot) {
  console.error("Usage: node prune-local-server.mjs <deployed-server-directory>");
  process.exit(1);
}

const root = path.resolve(serverRoot);
const removeTargets = [
  "src",
  "test",
  "tsconfig.json",
  "tsconfig.tsbuildinfo",
  "vitest.config.ts",
  "vitest.setup.ts",
  "node_modules/.cache",
  "node_modules/@types",
  "node_modules/typescript",
  "node_modules/prisma",
  "node_modules/@prisma/config",
  "node_modules/@prisma/engines",
  "node_modules/@prisma/engines-version",
  "node_modules/@prisma/fetch-engine",
  "node_modules/@prisma/get-platform",
  "node_modules/@prisma/client/generator-build",
];

for (const target of removeTargets) {
  await rm(path.join(root, target), { force: true, recursive: true });
}

const prismaRuntime = path.join(root, "node_modules", "@prisma", "client", "runtime");
for (const entry of await readdir(prismaRuntime)) {
  if (entry !== "library.js") {
    await rm(path.join(prismaRuntime, entry), { force: true, recursive: true });
  }
}

async function removeDevelopmentArtifacts(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await removeDevelopmentArtifacts(entryPath);
    } else if (entry.name.endsWith(".d.ts") || entry.name.endsWith(".js.map")) {
      await rm(entryPath, { force: true });
    }
  }
}

await removeDevelopmentArtifacts(path.join(root, "dist"));
