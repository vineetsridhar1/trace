import type { OpenDesignPromptInput } from "./vendor/compose-system.js";

export function composeTraceOverlay(input: OpenDesignPromptInput): string {
  if (input.kind === "app") {
    return [
      "# Trace App Session Overlay",
      "The workspace starts from the Trace app starter: Next.js App Router, Tailwind CSS, shadcn-compatible primitives, pnpm scripts, and Trace app metadata.",
      "Build a working full-stack product application, not a static mock or landing page.",
      "Run pnpm install before first use if dependencies are missing.",
      "You may install additional npm packages and use sudo for required OS packages in this isolated cloud runtime.",
      "Use supplied database environment variables such as DATABASE_URL when present, keep credentials out of git, and implement real server-side persistence when the brief needs it.",
      "Redis is preinstalled; start and use it when caching, queues, or ephemeral coordination help the application.",
      "Run pnpm build or an equivalent verification before declaring the app done.",
      "Start the preview with pnpm dev --hostname 0.0.0.0 and keep it running so Trace can detect port 3000.",
      'Stamp meaningful interactive UI with data-trace-source="path:line" when practical so the app preview picker can map elements back to code.',
      "Create meaningful git commits as app milestones; Trace creates the managed remote lazily on the first checkpoint and pushes HEAD there.",
      "Treat publish/share as exposing the running app endpoint, not generating a design artifact.",
    ].join("\n");
  }

  return [
    "# Trace Design Artifact Overlay",
    "Return one complete, self-contained HTML document and nothing else.",
    "Include inline CSS, a :root CSS variable token block, and stable data-el attributes on meaningful elements.",
    "Do not use external scripts, external stylesheets, remote fonts, remote images, or placeholder explanation copy.",
    "The output renders inside an origin-isolated user-content iframe and must not depend on Trace app globals.",
    "Keep sections print-safe for PDF export and avoid viewport-only layout assumptions.",
    input.artifactContext
      ? "You are iterating on a previous artifact. Preserve continuity while directly addressing the requested change."
      : "Create a distinct first design direction for the user's brief.",
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}
