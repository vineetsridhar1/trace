import { execFileSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const postgresRoot = process.argv[2];
if (!postgresRoot) {
  console.error("Usage: node repair-local-postgres-macos.mjs <postgres-directory>");
  process.exit(1);
}
if (process.platform !== "darwin") process.exit(0);

const root = path.resolve(postgresRoot);
const candidates = [];
for (const directory of ["bin", "lib"]) {
  const directoryPath = path.join(root, directory);
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    if (entry.isFile()) candidates.push(path.join(directoryPath, entry.name));
  }
}

for (const candidate of candidates) {
  let output;
  try {
    output = execFileSync("otool", ["-L", candidate], { encoding: "utf8" });
  } catch {
    continue;
  }
  const dependencies = output
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" ")[0])
    .filter((dependency) => dependency?.includes("/postgres-dist/") && dependency.includes("/lib/"));

  for (const dependency of dependencies) {
    const relativeLibPath = path.dirname(candidate) === path.join(root, "bin")
      ? `@loader_path/../lib/${path.basename(dependency)}`
      : `@loader_path/${path.basename(dependency)}`;
    execFileSync("install_name_tool", ["-change", dependency, relativeLibPath, candidate]);
  }
}
