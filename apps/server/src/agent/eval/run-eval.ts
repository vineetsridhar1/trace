/**
 * CLI entrypoint for running replay evals.
 *
 * Usage:
 *   npx tsx apps/server/src/agent/eval/run-eval.ts [--org <orgId>] [--limit <n>]
 *
 * Loads execution logs with stored replayPackets, replays them through
 * current prompt blocks, and reports comparison metrics.
 */

import { connectRedis } from "../../lib/redis.js";
import { loadEvalCases, runEvalSuite } from "./replay-runner.js";

async function main(): Promise<void> {
  // Parse CLI args
  const args = process.argv.slice(2);
  let organizationId: string | undefined;
  let limit = 20;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--org" && args[i + 1]) {
      organizationId = args[++i];
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    }
  }

  // Connect to Redis (required for LLM adapter)
  await connectRedis();

  console.log("Loading eval cases...");
  const cases = await loadEvalCases({
    organizationId,
    limit,
    requireReplayPacket: true,
  });

  if (cases.length === 0) {
    console.log("No eval cases found with replay packets.");
    console.log("Run the agent pipeline to generate execution logs with replayPacket data.");
    process.exit(0);
  }

  console.log(`Found ${cases.length} eval cases. Running replays...`);
  const summary = await runEvalSuite(cases);

  // Report results
  console.log("\n" + "=".repeat(60));
  console.log("EVAL RESULTS");
  console.log("=".repeat(60));
  console.log(`Total cases:           ${summary.totalCases}`);
  console.log(`Disposition match:     ${summary.dispositionMatchCount}/${summary.totalCases} (${(summary.dispositionMatchCount / summary.totalCases * 100).toFixed(1)}%)`);
  console.log(`Avg confidence delta:  ${summary.avgConfidenceDelta >= 0 ? "+" : ""}${summary.avgConfidenceDelta.toFixed(3)}`);
  console.log(`Avg action overlap:    ${(summary.avgActionSetOverlap * 100).toFixed(1)}%`);
  console.log(`Avg composite score:   ${(summary.avgComposite * 100).toFixed(1)}%`);
  console.log(`Prompt versions:       ${JSON.stringify(summary.promptVersions)}`);
  console.log("=".repeat(60));

  // Per-case details
  if (summary.results.length <= 20) {
    console.log("\nPer-case breakdown:");
    for (const r of summary.results) {
      const match = r.scores.dispositionMatch ? "MATCH" : "DIFF";
      console.log(
        `  ${r.caseId.slice(0, 8)} | ${match} | ` +
        `disp: ${r.replayDisposition} | conf: ${r.replayConfidence.toFixed(2)} | ` +
        `actions: [${r.replayActions.join(", ")}] | ` +
        `composite: ${(r.scores.composite * 100).toFixed(0)}% | ${r.latencyMs}ms`,
      );
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Eval run failed:", err);
  process.exit(1);
});
