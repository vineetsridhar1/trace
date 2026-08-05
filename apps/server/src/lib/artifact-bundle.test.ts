import { gzipSync } from "zlib";
import tar from "tar-stream";
import { describe, expect, it } from "vitest";
import { parseArtifactArchive } from "./artifact-bundle.js";

async function archive(entries: Array<{ name: string; body: string; type?: "file" | "symlink" }>) {
  const pack = tar.pack();
  const chunks: Buffer[] = [];
  pack.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    pack.on("end", () => resolve(gzipSync(Buffer.concat(chunks))));
    pack.on("error", reject);
  });
  for (const entry of entries) {
    pack.entry(
      {
        name: entry.name,
        type: entry.type ?? "file",
        ...(entry.type === "symlink" ? { linkname: "outside" } : {}),
      },
      entry.body,
    );
  }
  pack.finalize();
  return finished;
}

describe("parseArtifactArchive", () => {
  it("creates one canonical manifest for a multi-file bundle", async () => {
    const result = await parseArtifactArchive(
      await archive([
        { name: "./assets/screen.png", body: "png" },
        { name: "./plan.mdx", body: "# Plan" },
      ]),
    );

    expect(result.manifest.files.map((file) => file.path)).toEqual([
      "assets/screen.png",
      "plan.mdx",
    ]);
    expect(result.manifest.files[1]?.mediaType).toBe("text/mdx");
    expect(result.bundleDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects traversal and symlinks", async () => {
    await expect(
      parseArtifactArchive(await archive([{ name: "../secret", body: "nope" }])),
    ).rejects.toThrow("Unsafe artifact path");
    await expect(
      parseArtifactArchive(await archive([{ name: "link", body: "", type: "symlink" }])),
    ).rejects.toThrow("unsupported symlink");
  });
});
