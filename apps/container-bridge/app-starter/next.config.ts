import type { NextConfig } from "next";

// This app runs in a Trace app session and is served to the browser through the
// Trace preview proxy at `<key>.<previewHost>` — a different origin than the
// container's own localhost. Next's dev server treats requests from that origin
// as cross-origin and (in Next 15) blocks/flags `/_next/*`, HMR, and API calls.
// Allow the preview host so the app loads and calls its own API without CORS
// errors. Trace injects the exact wildcard host via TRACE_ALLOWED_DEV_ORIGINS;
// the literals are sensible fallbacks for known deployments.
const injected = (process.env.TRACE_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    ...injected,
    "*.preview.localhost",
    "*.preview.gettrace.org",
  ],
};

export default nextConfig;
