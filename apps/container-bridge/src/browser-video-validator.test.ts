import { describe, expect, it, vi } from "vitest";
import { validateBrowserVideo } from "./browser-video-validator.js";

const canonicalize = vi.fn(async (value: string) => value);
const inspect = vi.fn(async () => ({ isFile: () => true, size: 1024 }));

describe("validateBrowserVideo", () => {
  it("probes metadata and decodes a frame", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "2.5" },
          streams: [{ codec_name: "vp9", codec_type: "video", width: 1440, height: 900 }],
        }),
      })
      .mockResolvedValueOnce({ stdout: "" });

    await expect(
      validateBrowserVideo("/tmp/video/proof.webm", "/tmp/video", {
        canonicalize,
        inspect,
        run,
      }),
    ).resolves.toEqual({
      bytes: 1024,
      codec: "vp9",
      durationSeconds: 2.5,
      height: 900,
      width: 1440,
    });
    expect(run).toHaveBeenNthCalledWith(1, "ffprobe", expect.any(Array));
    expect(run).toHaveBeenNthCalledWith(2, "ffmpeg", expect.arrayContaining(["-frames:v", "1"]));
  });

  it("rejects files outside the invocation output directory", async () => {
    await expect(
      validateBrowserVideo("/tmp/other/proof.webm", "/tmp/video", {
        canonicalize,
        inspect,
        run: vi.fn(),
      }),
    ).rejects.toThrow("inside TRACE_BROWSER_VIDEO_DIR");
  });

  it("rejects unsupported or corrupt probe output", async () => {
    await expect(
      validateBrowserVideo("/tmp/video/proof.webm", "/tmp/video", {
        canonicalize,
        inspect,
        run: vi.fn().mockResolvedValue({
          stdout: JSON.stringify({
            format: { duration: "0" },
            streams: [{ codec_name: "h264", codec_type: "video", width: 1440, height: 900 }],
          }),
        }),
      }),
    ).rejects.toThrow("WebM video codec");
  });
});
