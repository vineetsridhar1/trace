export const DESIGN_ARTIFACT_CONTENT_TYPE = "text/html";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildPlaceholderDesignArtifactHtml(prompt: string | null | undefined): string {
  const title = prompt?.trim() || "Untitled design";
  const escapedTitle = escapeHtml(title.slice(0, 120));
  const escapedPrompt = escapeHtml(title);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapedTitle}</title>
  <style>
    :root {
      --trace-accent: #2563eb;
      --trace-bg: #f8fafc;
      --trace-ink: #0f172a;
      --trace-muted: #64748b;
      --trace-radius: 18px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: var(--trace-bg);
      color: var(--trace-ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(880px, calc(100vw - 48px));
      padding: 48px;
      border: 1px solid rgba(15, 23, 42, 0.12);
      border-radius: var(--trace-radius);
      background: white;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.12);
    }
    p {
      margin: 0 0 16px;
      color: var(--trace-muted);
      font-size: 16px;
      line-height: 1.6;
    }
    h1 {
      margin: 0 0 18px;
      max-width: 720px;
      font-size: 44px;
      line-height: 1.05;
      letter-spacing: 0;
    }
    .eyebrow {
      color: var(--trace-accent);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <main data-el="design-placeholder">
    <p class="eyebrow">Design artifact</p>
    <h1>${escapedTitle}</h1>
    <p>${escapedPrompt}</p>
    <p>This placeholder proves the artifact canvas, lineage, and session-kind plumbing. The next slice replaces it with LLMAdapter generation.</p>
  </main>
</body>
</html>`;
}
