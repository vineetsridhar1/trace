import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

type ReviewIssue = { category: string; detail: string };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, ".trace", "review");
const baseUrl = process.env.TRACE_ANIMATION_REVIEW_URL ?? "http://127.0.0.1:3000";

async function executablePath(): Promise<string> {
  const candidates = [
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue to the next supported runtime location.
    }
  }
  throw new Error("Chromium is unavailable. Rebuild the Trace runtime image or set CHROMIUM_PATH.");
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: await executablePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const issues: ReviewIssue[] = [];

try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (error) => issues.push({ category: "runtime", detail: error.message }));
  page.on("console", (message) => {
    // Chrome auto-requests /favicon.ico on every navigation; this starter
    // declares none, so it 404s regardless of what the agent builds — not a
    // real issue, and would otherwise fail every single review run. The
    // failed-resource message doesn't name the URL in its text, so check the
    // reporting location instead.
    if (message.type() === "error" && !message.location().url.includes("favicon.ico")) {
      issues.push({ category: "runtime", detail: message.text() });
    }
  });
  page.on("requestfailed", (request) => {
    if (!request.url().includes("favicon.ico")) {
      issues.push({ category: "runtime", detail: `${request.url()} failed to load` });
    }
  });

  // "networkidle" never fires here: Vite's dev server keeps an HMR WebSocket
  // open indefinitely, so the network is never idle. "load" is sufficient
  // since this is a plain client-rendered SPA with no lazy data fetching.
  try {
    await page.goto(baseUrl, { waitUntil: "load" });
  } catch (error) {
    throw new Error(
      `Could not reach the dev server at ${baseUrl} — is it still running on port 3000? (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outputDir, "01-initial.png") });

  // Generic interaction pass: the concept is freeform, so this can't target a
  // specific element — it hovers, clicks, then drags at the viewport center,
  // covering the trigger types (hover, click, drag) an animation piece is
  // likely to respond to. A click is a full down+up with no movement in
  // between, done *before* the drag: a drag's own mouseup can also fire a
  // click, so doing the click after would silently toggle a simple boolean
  // back to its starting value and make the "after" shot look unchanged.
  // Read the screenshots yourself to judge whether the result looks right;
  // this script only catches crashes.
  const centerX = 640;
  const centerY = 400;
  await page.mouse.move(centerX, centerY);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outputDir, "02-hover.png") });

  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(outputDir, "03-press.png") });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outputDir, "04-click.png") });

  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 120, centerY + 60, { steps: 10 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outputDir, "05-drag.png") });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outputDir, "06-release.png") });

  await page.close();
} finally {
  await browser.close();
}

await writeFile(
  join(outputDir, "report.json"),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), issues }, null, 2)}\n`,
);

if (issues.length > 0) {
  for (const issue of issues) console.error(`${issue.category}: ${issue.detail}`);
  console.error(`Animation review found ${issues.length} runtime issue(s). Screenshots: ${outputDir}`);
  process.exitCode = 1;
} else {
  console.log(`Animation review ran cleanly. Screenshots: ${outputDir}`);
}
