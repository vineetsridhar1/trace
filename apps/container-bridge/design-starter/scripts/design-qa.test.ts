import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { auditScreenSource, validateDesignProject } from "./design-qa";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the bundled starter satisfies deterministic design QA", async () => {
  const report = await validateDesignProject(root);
  assert.deepEqual(report, { errors: [], warnings: [] });
});

test("screen audit rejects app behavior and external assets", () => {
  const report = auditScreenSource(
    'export default function Bad() { fetch("/api"); return <img src="https://example.com/a.png" />; }',
    "Bad.tsx",
  );
  assert.equal(report.errors.length, 2);
});

test("screen audit flags colors that bypass the token contract", () => {
  const report = auditScreenSource(
    'export default function Raw() { return <div className="bg-zinc-900 text-[#fff]" />; }',
    "Raw.tsx",
  );
  assert.equal(report.warnings.length, 1);
});

test("supporting design components may use named exports but not network behavior", () => {
  const good = auditScreenSource("export function Chart() { return <svg />; }", "Chart.tsx", false);
  assert.deepEqual(good.errors, []);
  const bad = auditScreenSource(
    'export function Chart() { return fetch("/metrics"); }',
    "Chart.tsx",
    false,
  );
  assert.match(bad.errors[0] ?? "", /production network behavior/);
});
