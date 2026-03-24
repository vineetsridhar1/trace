import {
  postCommitHook,
  postRewriteHook,
  prepareCommitMessageHook,
} from "./hook-runtime.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const [hookName, ...args] = process.argv.slice(2);
  const cwd = process.cwd();

  switch (hookName) {
    case "prepare-commit-msg": {
      const messageFilePath = args[0];
      if (!messageFilePath) {
        throw new Error("prepare-commit-msg requires the commit message file path.");
      }
      await prepareCommitMessageHook(cwd, messageFilePath);
      return;
    }

    case "post-commit": {
      await postCommitHook(cwd);
      return;
    }

    case "post-rewrite": {
      const rewriteType = args[0] ?? "rewrite";
      const input = await readStdin();
      await postRewriteHook(cwd, rewriteType, input);
      return;
    }

    default:
      throw new Error(`Unsupported git hook: ${hookName ?? "(missing)"}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[trace-hooks] ${message}`);
  process.exit(1);
});
