import { access } from "node:fs/promises";
import { chromium } from "playwright-core";

const webUrl = process.env.TRACE_DM_E2E_WEB_URL ?? "http://localhost:3037";
const serverUrl = process.env.TRACE_DM_E2E_SERVER_URL ?? "http://localhost:4037";
const executablePath =
  process.env.PLAYWRIGHT_CHROME_PATH ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/bin/google-chrome");

await access(executablePath);
const browser = await chromium.launch({ executablePath, headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const login = await context.request.post(`${serverUrl}/auth/local/login`, {
    data: { name: "DM Seed Alice" },
  });
  if (!login.ok()) {
    throw new Error(`Local login failed (${login.status()}): ${await login.text()}`);
  }

  const page = await context.newPage();
  await page.goto(webUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("Direct Messages", { exact: true }).waitFor();
  await page.getByText("DM Seed Bob", { exact: true }).click();

  const messageList = page.getByTestId("chat-message-list");
  await messageList.waitFor();
  await page.getByText(/E2E realtime message dm-e2e-/).last().waitFor();

  const initialVirtualRows = await messageList.locator("[data-index]").count();
  if (initialVirtualRows > 40) {
    throw new Error(`Virtualized history rendered ${initialVirtualRows} rows initially`);
  }

  const sentText = `Browser E2E message ${Date.now()}`;
  const editor = page.locator(".chat-editor .ql-editor");
  await editor.fill(sentText);
  await editor.press("Enter");
  await page.getByText(sentText, { exact: true }).waitFor();

  await messageList.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await page.waitForTimeout(750);
  const rowsAfterPrepend = await messageList.locator("[data-index]").count();
  if (rowsAfterPrepend > 40) {
    throw new Error(`Virtualized history rendered ${rowsAfterPrepend} rows after prepend`);
  }

  console.log(
    JSON.stringify({
      login: true,
      directMessageOpened: true,
      optimisticSendRendered: true,
      initialVirtualRows,
      rowsAfterPrepend,
    }),
  );
} finally {
  await browser.close();
}
