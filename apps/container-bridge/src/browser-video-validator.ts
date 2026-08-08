import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_VIDEO_BYTES = 32 * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 10 * 60;
const MAX_VIDEO_DIMENSION = 4096;
const WEBM_VIDEO_CODECS = new Set(["av1", "vp8", "vp9"]);

type ProbeResult = {
  format?: { duration?: string };
  streams?: Array<{
    codec_name?: string;
    codec_type?: string;
    height?: number;
    width?: number;
  }>;
};

type ValidationDependencies = {
  inspect?: (file: string) => Promise<{ isFile(): boolean; size: number }>;
  canonicalize?: (file: string) => Promise<string>;
  run?: (command: string, args: string[]) => Promise<{ stdout: string }>;
};

export type BrowserVideoMetadata = {
  bytes: number;
  codec: string;
  durationSeconds: number;
  height: number;
  width: number;
};

function requireInsideOutputDirectory(file: string, outputDirectory: string): void {
  const pathFromRoot = relative(outputDirectory, file);
  if (
    !pathFromRoot ||
    pathFromRoot.startsWith("..") ||
    resolve(outputDirectory, pathFromRoot) !== file
  ) {
    throw new Error("Browser video must be a file inside TRACE_BROWSER_VIDEO_DIR");
  }
}

export async function validateBrowserVideo(
  file: string,
  outputDirectory: string,
  dependencies: ValidationDependencies = {},
): Promise<BrowserVideoMetadata> {
  const inspect = dependencies.inspect ?? stat;
  const canonicalize = dependencies.canonicalize ?? realpath;
  const run =
    dependencies.run ??
    ((command: string, args: string[]) =>
      execFileAsync(command, args, { maxBuffer: 1024 * 1024, timeout: 30_000 }));

  const [canonicalFile, canonicalOutput] = await Promise.all([
    canonicalize(file),
    canonicalize(outputDirectory),
  ]);
  requireInsideOutputDirectory(canonicalFile, canonicalOutput);
  const fileStat = await inspect(canonicalFile);
  if (!fileStat.isFile() || fileStat.size < 1 || fileStat.size > MAX_VIDEO_BYTES) {
    throw new Error("Browser video must be a non-empty file no larger than 32 MiB");
  }

  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_name,codec_type,width,height",
    "-of",
    "json",
    canonicalFile,
  ]);
  const probe = JSON.parse(stdout) as ProbeResult;
  const stream = probe.streams?.find((candidate) => candidate.codec_type === "video");
  const durationSeconds = Number(probe.format?.duration);
  const codec = stream?.codec_name ?? "";
  const width = stream?.width ?? 0;
  const height = stream?.height ?? 0;
  if (!WEBM_VIDEO_CODECS.has(codec)) throw new Error("Browser video must use a WebM video codec");
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > MAX_VIDEO_DURATION_SECONDS
  ) {
    throw new Error("Browser video duration must be between 0 and 600 seconds");
  }
  if (width < 1 || height < 1 || width > MAX_VIDEO_DIMENSION || height > MAX_VIDEO_DIMENSION) {
    throw new Error("Browser video dimensions are invalid");
  }

  await run("ffmpeg", ["-v", "error", "-i", canonicalFile, "-frames:v", "1", "-f", "null", "-"]);
  return { bytes: fileStat.size, codec, durationSeconds, height, width };
}
