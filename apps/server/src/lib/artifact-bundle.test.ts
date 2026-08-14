import { gzipSync } from "zlib";
import { describe, expect, it } from "vitest";
import { parseArtifactArchive } from "./artifact-bundle.js";

function archive(entries: Array<{ name: string; body: string; type?: "file" | "symlink" }>) {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.body);
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, 100, "utf8");
    header.write("0000644\0", 100, 8, "ascii");
    header.write("0000000\0", 108, 8, "ascii");
    header.write("0000000\0", 116, 8, "ascii");
    header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
    header.write("00000000000\0", 136, 12, "ascii");
    header.fill(0x20, 148, 156);
    header.write(entry.type === "symlink" ? "2" : "0", 156, 1, "ascii");
    if (entry.type === "symlink") header.write("outside", 157, 100, "utf8");
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");
    const checksum = [...header].reduce((sum, value) => sum + value, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}

describe("parseArtifactArchive", () => {
  it("creates a canonical manifest for a browser video", async () => {
    const result = await parseArtifactArchive(
      archive([{ name: "./browser-proof.webm", body: "video" }]),
    );

    expect(result.manifest.files).toEqual([
      expect.objectContaining({ path: "browser-proof.webm", mediaType: "video/webm", size: 5 }),
    ]);
    expect(result.bundleDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects traversal and symlinks", async () => {
    await expect(
      parseArtifactArchive(archive([{ name: "../secret", body: "nope" }])),
    ).rejects.toThrow("Unsafe artifact path");
    await expect(
      parseArtifactArchive(archive([{ name: "link", body: "", type: "symlink" }])),
    ).rejects.toThrow("unsupported SymbolicLink");
  });
});
