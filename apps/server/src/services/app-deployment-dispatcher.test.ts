import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it } from "vitest";
import { createSourceBundleLimiter } from "./app-deployment-dispatcher.js";

describe("app deployment source streaming", () => {
  it("streams archives without buffering the complete source", async () => {
    const chunks: Buffer[] = [];
    await pipeline(
      Readable.from([Buffer.from("abc"), Buffer.from("def")]),
      createSourceBundleLimiter(6),
      new Writable({
        write(chunk: Buffer, _encoding, done) {
          chunks.push(chunk);
          done();
        },
      }),
    );

    expect(Buffer.concat(chunks).toString()).toBe("abcdef");
  });

  it("rejects an archive as soon as it exceeds the source limit", async () => {
    await expect(
      pipeline(
        Readable.from([Buffer.alloc(4), Buffer.alloc(3)]),
        createSourceBundleLimiter(6),
        new Writable({
          write(_chunk, _encoding, done) {
            done();
          },
        }),
      ),
    ).rejects.toThrow("exceeds");
  });
});
