import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { TRACE_CLI_ARTIFACT_MAX_BYTES } from "@trace/cli-contract";
import { CliError, ExitCode, usage } from "../errors.js";
import { defineCommand, optionString } from "../runtime.js";

const UPLOAD_TIMEOUT_MS = 2 * 60 * 1_000;

export const artifactCommand = defineCommand({
  path: ["artifact", "push"],
  description: "Upload an immutable artifact from an active Trace invocation",
  examples: [
    '"$TRACE_CLI" artifact push visual-plan docs/plan --key primary --json',
    '"$TRACE_CLI" artifact push video output/demo.mp4 --json',
  ],
  effects: [
    "Packages the supplied file or directory and creates an immutable Trace artifact.",
    "Retries transient upload failures once with the same idempotency key.",
  ],
  output: "The artifact ID, type, key, and idempotency key for a safe retry.",
  nextSteps: [
    "Use a stable type name for artifacts that should be grouped together.",
    "Keep the returned idempotency key when retrying a failed upload.",
  ],
  notes: [
    "Any non-empty artifact type is accepted; video artifacts must be one validated video file.",
    "The compressed upload must not exceed 64 MiB.",
  ],
  positionals: [
    { name: "type", required: true },
    { name: "file-or-directory", required: true },
  ],
  options: [
    {
      name: "key",
      flag: "--key",
      kind: "string",
      valueName: "KEY",
      description: "Artifact slot key",
    },
    {
      name: "idempotencyKey",
      flag: "--idempotency-key",
      kind: "string",
      valueName: "KEY",
      description: "Retry-safe upload key",
    },
  ],
  async run(ctx, input) {
    const type = input.positionals[0] ?? usage("Artifact type is required");
    const sourceArg = input.positionals[1] ?? usage("Artifact file or directory is required");
    const source = resolve(sourceArg);
    const key =
      optionString(input, "key") ??
      (type === "visual-plan" || type === "trace.visual-plan.v1" ? "primary" : "default");
    const idempotencyKey = optionString(input, "idempotencyKey") ?? randomUUID();
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
      if (statSync(archivePath).size > TRACE_CLI_ARTIFACT_MAX_BYTES) {
        usage(
          `Artifact archive exceeds the ${TRACE_CLI_ARTIFACT_MAX_BYTES / 1024 / 1024} MiB upload limit`,
        );
      }

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
          signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
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
        const error =
          response.status === 401
            ? { exitCode: ExitCode.authentication, category: "authentication" }
            : response.status === 403
              ? { exitCode: ExitCode.authorization, category: "authorization" }
              : response.status >= 400 && response.status < 500
                ? { exitCode: ExitCode.validation, category: "validation" }
                : { exitCode: ExitCode.server, category: "server" };
        throw new CliError(
          `${typeof result.error === "string" ? result.error : "Artifact upload failed"}; retry with --idempotency-key ${idempotencyKey}`,
          error.exitCode,
          error.category,
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
});
