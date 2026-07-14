import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guidance = readFileSync(new URL("./ai-guidance.md", import.meta.url), "utf8");
const agents = readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");
const claude = readFileSync(new URL("../CLAUDE.md", import.meta.url), "utf8");

test("gives Claude and Codex the same Design-session role", () => {
  assert.equal(claude, agents);
  assert.match(agents, /Design session, not an App or Coding session/);
  assert.match(agents, /React is only the rendering medium/);
});

test("keeps designs on the canvas and inside the prototype boundary", () => {
  assert.match(guidance, /reviewable visual design artifacts/);
  assert.match(guidance, /Do not build APIs, databases, authentication, persistence/);
  assert.match(guidance, /Do not turn the starter into a standalone app/);
  assert.match(guidance, /every requested screen is visible as a labeled artboard/);
});
