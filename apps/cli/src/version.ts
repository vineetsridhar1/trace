import { readFileSync } from "node:fs";

export function readCliVersion(): string {
  const { version } = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  return version;
}
