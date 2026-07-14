import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guidance = readFileSync(new URL("./ai-guidance.md", import.meta.url), "utf8");
const agents = readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");
const claude = readFileSync(new URL("../CLAUDE.md", import.meta.url), "utf8");
const notice = readFileSync(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8");
const openDesignLicense = readFileSync(
  new URL("../licenses/open-design-APACHE-2.0.txt", import.meta.url),
  "utf8",
);

test("gives Claude and Codex the same Design-session role", () => {
  assert.equal(claude, agents);
  assert.match(agents, /Design session, not an App or Coding session/);
  assert.match(agents, /React is only the rendering medium/);
});

test("keeps designs on the canvas and inside the prototype boundary", () => {
  assert.match(guidance, /reviewable visual design artifacts/);
  assert.match(guidance, /Do not build APIs, databases, authentication, persistence/);
  assert.match(guidance, /Do not turn the starter into a standalone app/);
  assert.match(guidance, /every requested screen is a labeled artboard/);
});

test("defines an artifact-first design workflow and quality gate", () => {
  assert.match(guidance, /## Precedence/);
  assert.match(guidance, /## Design loop/);
  assert.match(guidance, /Commit to a visual system/);
  assert.match(guidance, /design\.brief\.json/);
  assert.match(guidance, /trace\.tokens\.json/);
  assert.match(guidance, /Executable tokens and screen primitives/);
  assert.match(guidance, /docs\/playbooks\/README\.md/);
  assert.match(guidance, /Avoid generic AI styling/);
  assert.match(guidance, /## Final critique/);
  assert.match(guidance, /Brief fidelity/);
  assert.match(guidance, /Interaction and accessibility/);
  assert.match(guidance, /pnpm design:review/);
});

test("routes specialized design work without replacing the shared canvas contract", () => {
  assert.match(guidance, /reference-grounding\.md/);
  assert.match(guidance, /visual-directions\.md/);
  assert.match(guidance, /Build one representative screen first/);
  assert.match(guidance, /Inspect every PNG/);
});

test("preserves attribution for the adapted Open Design guidance", () => {
  assert.match(notice, /Open Design/);
  assert.match(notice, /Apache License 2\.0/);
  assert.match(openDesignLicense, /Apache License/);
  assert.match(openDesignLicense, /Version 2\.0, January 2004/);
});
