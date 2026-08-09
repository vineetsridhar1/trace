import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { CliError, ExitCode, usage } from "../errors.js";
import type { Command } from "../runtime.js";

export const artifactCommand: Command = {
  path: ["artifact", "push"],
  usage:
    "trace artifact push <type> <file-or-directory> [--key KEY] [--idempotency-key KEY] [--json]",
  description: "Upload an immutable artifact from an active Trace invocation",
  async run(ctx) {
    const type = ctx.args[2] || usage("Artifact type is required");
    const sourceArg = ctx.args[3] || usage("Artifact file or directory is required");
    const source = resolve(sourceArg);
    let key = type === "visual-plan" || type === "trace.visual-plan.v1" ? "primary" : "default";
    let idempotencyKey: string = randomUUID();
    for (let index = 4; index < ctx.args.length; index += 1) {
      const flag = ctx.args[index];
      if (flag === "--key") key = ctx.args[++index] || usage("--key requires a value");
      else if (flag === "--idempotency-key") {
        idempotencyKey = ctx.args[++index] || usage("--idempotency-key requires a value");
      } else usage(`Unknown option: ${flag}`);
    }
    if (idempotencyKey.length > 200) usage("--idempotency-key must be at most 200 characters");
    if (!existsSync(source)) usage(`Path does not exist: ${source}`);
    const apiUrl = ctx.env.TRACE_API_URL || ctx.env.TRACE_SERVER_URL;
    const token = ctx.env.TRACE_INVOCATION_TOKEN;
    if (!apiUrl || !token) {
      throw new CliError(
        "This command is only available inside an active Trace session",
        ExitCode.authentication,
        "authentication",
      );
    }

    if (type === "video" || type === "trace.video.v1") {
      if (!statSync(source).isFile()) usage("Video artifacts require one video file");
      const validator = ctx.env.TRACE_BROWSER_VIDEO_VALIDATE;
      if (!validator) usage("Browser video validation is unavailable");
      const validated = spawnSync(validator, [source], { stdio: "inherit", env: ctx.env });
      if (validated.status !== 0) {
        throw new CliError("video validation failed; artifact was not uploaded", 1, "validation");
      }
    }

    const temporary = mkdtempSync(join(tmpdir(), "trace-artifact-"));
    const archivePath = join(temporary, "artifact.tar.gz");
    try {
      const sourceStat = statSync(source);
      const tarArgs = sourceStat.isDirectory()
        ? ["-czf", archivePath, "-C", source, "."]
        : ["-czf", archivePath, "-C", dirname(source), basename(source)];
      const packed = spawnSync("tar", tarArgs, {
        stdio: "inherit",
        env: { ...ctx.env, COPYFILE_DISABLE: "1" },
      });
      if (packed.status !== 0) usage("Could not package artifact");

      const upload = () =>
        fetch(new URL("/agent/artifacts", apiUrl), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/gzip",
            "X-Trace-Artifact-Type": type,
            "X-Trace-Artifact-Key": key,
            "X-Trace-Idempotency-Key": idempotencyKey,
          },
          body: readFileSync(archivePath),
        });
      let response: Response;
      try {
        response = await upload();
        if (response.status >= 500) response = await upload();
      } catch {
        try {
          response = await upload();
        } catch {
          throw new CliError(
            `Could not connect to Trace; retry with --idempotency-key ${idempotencyKey}`,
            ExitCode.connectivity,
            "connectivity",
          );
        }
      }
      const result = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        artifact?: { id?: unknown };
      };
      if (!response.ok || typeof result.artifact?.id !== "string") {
        throw new CliError(
          `${typeof result.error === "string" ? result.error : "Artifact upload failed"}; retry with --idempotency-key ${idempotencyKey}`,
          response.status === 401 ? ExitCode.authentication : ExitCode.server,
          response.status === 401 ? "authentication" : "server",
        );
      }
      ctx.output(
        { artifact: { id: result.artifact.id, type, key }, idempotencyKey },
        result.artifact.id,
      );
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  },
};
