import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateDesignSystemPackage } from "@trace/shared";
import { describe, expect, it } from "vitest";

async function packageFiles(root: string, current = ""): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const entry of await readdir(path.join(root, current), { withFileTypes: true })) {
    const relative = path.posix.join(current, entry.name);
    if (entry.isDirectory()) {
      for (const [name, body] of await packageFiles(root, relative)) files.set(name, body);
    } else if (entry.isFile()) {
      files.set(relative, await readFile(path.join(root, relative)));
    }
  }
  return files;
}

describe("Trace Default design-system package", () => {
  it("ships through the same strict package contract as custom versions", async () => {
    const root = fileURLToPath(new URL("../design-default-package", import.meta.url));
    expect(validateDesignSystemPackage(await packageFiles(root))).toMatchObject({
      valid: true,
      errors: [],
    });
  });
});
