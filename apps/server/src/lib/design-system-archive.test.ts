import { describe, expect, it } from "vitest";
import { pack } from "tar-stream";
import {
  createDeterministicTarGz,
  parseDesignSystemTarGz,
  parseGitTreeArchive,
  sha256,
} from "./design-system-archive.js";

describe("design-system archives", () => {
  it("packages files deterministically", async () => {
    const files = new Map([["manifest.json", Buffer.from("{}")]]);
    const first = await createDeterministicTarGz(files);
    const second = await createDeterministicTarGz(files);
    expect(sha256(first)).toBe(sha256(second));
    expect((await parseDesignSystemTarGz(first)).files.get("manifest.json")?.toString()).toBe("{}");
  });

  it("rejects links in tracked-tree archives", async () => {
    const archive = pack();
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve) =>
      archive.on("end", () => resolve(Buffer.concat(chunks))),
    );
    archive.entry({ name: "link", type: "symlink", linkname: "/etc/passwd" });
    archive.finalize();
    await expect(parseGitTreeArchive(await done)).rejects.toThrow("forbidden");
  });
});
