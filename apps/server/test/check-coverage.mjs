import fs from "node:fs";
import path from "node:path";

const summaryPath = path.resolve(process.cwd(), "coverage", "coverage-summary.json");
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

const hotspotThresholds = {
  "src/agent/aggregator.ts": {
    statements: 85,
    lines: 85,
    functions: 90,
    branches: 70,
  },
  "src/agent/executor.ts": {
    statements: 70,
    lines: 70,
    functions: 100,
    branches: 70,
  },
  "src/services/chat.ts": {
    statements: 55,
    lines: 55,
    functions: 70,
    branches: 50,
  },
  "src/services/ticket.ts": {
    statements: 85,
    lines: 85,
    functions: 85,
    branches: 65,
  },
};

function findSummaryEntry(relativePath) {
  return Object.entries(summary).find(([key]) => {
    if (key === relativePath) return true;
    if (key.endsWith(`/${relativePath}`)) return true;
    if (key.endsWith(`\\${relativePath}`)) return true;
    return false;
  });
}

const failures = [];

for (const [relativePath, thresholds] of Object.entries(hotspotThresholds)) {
  const entry = findSummaryEntry(relativePath);
  if (!entry) {
    failures.push(`${relativePath}: missing from coverage summary`);
    continue;
  }

  const [, metrics] = entry;
  for (const [metric, minimum] of Object.entries(thresholds)) {
    const actual = metrics[metric]?.pct;
    if (typeof actual !== "number") {
      failures.push(`${relativePath}: missing metric ${metric}`);
      continue;
    }
    if (actual < minimum) {
      failures.push(`${relativePath}: ${metric} ${actual.toFixed(2)}% < ${minimum}%`);
    }
  }
}

if (failures.length > 0) {
  console.error("Coverage hotspot thresholds failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}
