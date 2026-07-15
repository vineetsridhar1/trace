import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import manifestSource from "../design.canvas.json";
import { validateDesignManifest } from "../src/canvas/manifest";

type ReviewIssue = { screenId: string; category: string; detail: string };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, ".trace", "review");
const baseUrl = process.env.TRACE_DESIGN_REVIEW_URL ?? "http://127.0.0.1:3000";
const manifest = validateDesignManifest(manifestSource);

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

function safeFileName(id: string): string {
  return id.replace(/[^a-z0-9._-]+/gi, "-");
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: await executablePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const issues: ReviewIssue[] = [];

try {
  for (const screen of manifest.screens) {
    const page = await browser.newPage({
      viewport: { width: screen.viewport.width, height: screen.viewport.height },
      deviceScaleFactor: 1,
    });
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });
    const url = new URL(baseUrl);
    url.searchParams.set("__trace_review_screen", screen.id);
    await page.goto(url.toString(), { waitUntil: "networkidle" });
    const rootSelector = "[data-trace-review-screen]";
    await page.locator(rootSelector).waitFor({ state: "visible" });
    await page.evaluate("globalThis.__name = (target) => target");

    const screenIssues = await page.locator(rootSelector).evaluate((reviewRoot) => {
      type BrowserIssue = { category: string; detail: string };
      const found: BrowserIssue[] = [];
      const elements = [reviewRoot, ...Array.from(reviewRoot.querySelectorAll<HTMLElement>("*"))];
      const describe = (element: Element): string => {
        const id = element.id ? `#${element.id}` : "";
        const classes = Array.from(element.classList)
          .slice(0, 2)
          .map((name) => `.${name}`)
          .join("");
        return `${element.tagName.toLowerCase()}${id}${classes}`;
      };

      for (const element of elements) {
        const style = getComputedStyle(element);
        const horizontalOverflow = element.scrollWidth - element.clientWidth > 1;
        const verticalOverflow = element.scrollHeight - element.clientHeight > 1;
        if (horizontalOverflow && !["auto", "scroll"].includes(style.overflowX)) {
          found.push({ category: "layout", detail: `${describe(element)} overflows horizontally` });
        }
        if (verticalOverflow && style.overflowY === "hidden") {
          found.push({ category: "layout", detail: `${describe(element)} clips vertical content` });
        }
      }

      for (const image of reviewRoot.querySelectorAll("img")) {
        if (!image.hasAttribute("alt")) {
          found.push({
            category: "accessibility",
            detail: `${describe(image)} is missing alt text`,
          });
        }
      }

      const labelledByText = (element: Element): string => {
        const labelledBy = element.getAttribute("aria-labelledby");
        if (!labelledBy) return "";
        return labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim();
      };
      const accessibleName = (element: Element): string => {
        const aria = element.getAttribute("aria-label")?.trim() ?? labelledByText(element);
        if (aria) return aria;
        if (element instanceof HTMLInputElement && element.id) {
          return (
            document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent?.trim() ??
            ""
          );
        }
        return element.textContent?.trim() ?? "";
      };
      for (const control of reviewRoot.querySelectorAll(
        "button, a[href], input, select, textarea, [role='button']",
      )) {
        if (!accessibleName(control)) {
          found.push({
            category: "accessibility",
            detail: `${describe(control)} has no accessible name`,
          });
        }
      }

      for (const asset of reviewRoot.querySelectorAll("img, source, video, audio, script, link")) {
        const reference = asset.getAttribute("src") ?? asset.getAttribute("href");
        if (reference && /^https?:\/\//i.test(reference)) {
          found.push({
            category: "export",
            detail: `${describe(asset)} uses external asset ${reference}`,
          });
        }
      }

      const parseRgb = (value: string): [number, number, number, number] | null => {
        const match = value.match(
          /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/,
        );
        if (!match) return null;
        return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 1)];
      };
      const luminance = ([red, green, blue]: [number, number, number]): number => {
        const channels = [red, green, blue].map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const contrast = (a: [number, number, number], b: [number, number, number]): number => {
        const [lighter, darker] = [luminance(a), luminance(b)].sort((left, right) => right - left);
        return (lighter + 0.05) / (darker + 0.05);
      };
      const effectiveBackground = (element: Element): [number, number, number] | null => {
        let current: Element | null = element;
        while (current) {
          const color = parseRgb(getComputedStyle(current).backgroundColor);
          if (color && color[3] === 1) return [color[0], color[1], color[2]];
          current = current.parentElement;
        }
        return null;
      };
      const contrastDetails = new Set<string>();
      for (const element of elements) {
        const ownsVisibleText = Array.from(element.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
        );
        if (!ownsVisibleText || element.getBoundingClientRect().width === 0) continue;
        const style = getComputedStyle(element);
        const foreground = parseRgb(style.color);
        const background = effectiveBackground(element);
        if (!foreground || foreground[3] !== 1 || !background) continue;
        const ratio = contrast([foreground[0], foreground[1], foreground[2]], background);
        const fontSize = Number.parseFloat(style.fontSize);
        const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
        const threshold = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
        if (ratio + 0.01 < threshold) {
          contrastDetails.add(`${describe(element)} text contrast is ${ratio.toFixed(2)}:1`);
        }
      }
      for (const detail of Array.from(contrastDetails).slice(0, 20)) {
        found.push({ category: "contrast", detail });
      }

      return found;
    });

    issues.push(...screenIssues.map((issue) => ({ screenId: screen.id, ...issue })));
    issues.push(
      ...runtimeErrors.map((detail) => ({ screenId: screen.id, category: "runtime", detail })),
    );
    await page.screenshot({
      path: join(outputDir, `${safeFileName(screen.id)}.png`),
      animations: "disabled",
      fullPage: false,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

await writeFile(
  join(outputDir, "report.json"),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), issues }, null, 2)}\n`,
);

if (issues.length > 0) {
  for (const issue of issues) console.error(`${issue.screenId} ${issue.category}: ${issue.detail}`);
  console.error(`Visual review failed with ${issues.length} issue(s). Screenshots: ${outputDir}`);
  process.exitCode = 1;
} else {
  console.log(
    `Visual review passed for ${manifest.screens.length} screen(s). Screenshots: ${outputDir}`,
  );
}
