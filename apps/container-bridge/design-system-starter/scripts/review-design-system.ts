import { access, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
async function executable() {
  for (const candidate of [
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean) as string[])
    try {
      await access(candidate);
      return candidate;
    } catch {}
  throw new Error("Chromium is unavailable");
}
const browser = await chromium.launch({
  executablePath: await executable(),
  headless: true,
  args: ["--no-sandbox"],
});
try {
  for (const target of [
    { board: "foundations", output: "foundations" },
    { board: "components", output: "components" },
  ]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `${process.env.TRACE_DESIGN_SYSTEM_REVIEW_URL ?? "http://127.0.0.1:3000"}?board=${target.board}`,
      { waitUntil: "networkidle" },
    );
    if (errors.length) throw new Error(errors.join("; "));
    const specimenHtml = await page.evaluate(() => {
      document.querySelectorAll("script").forEach((element) => element.remove());
      document
        .querySelectorAll("[data-vite-dev-id]")
        .forEach((element) => element.removeAttribute("data-vite-dev-id"));
      return `<!doctype html>\n${document.documentElement.outerHTML}`.replace(/[ \t]+$/gm, "");
    });
    await writeFile(
      new URL(`../design-system/preview/${target.output}.html`, import.meta.url),
      specimenHtml,
    );
    await page.screenshot({
      path: new URL(`../design-system/preview/${target.output}.png`, import.meta.url).pathname,
      fullPage: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log("Design-system specimens reviewed and exported.");
