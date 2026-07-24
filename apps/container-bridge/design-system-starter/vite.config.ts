import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `vite build` output is captured as the saved preview: the bridge inlines the
// single entry script/style into one self-contained HTML served from S3.
// inlineDynamicImports collapses any code-split chunks into that one bundle so
// a workbench that uses `import()` can't leave lazy chunks that 404 once served
// as an isolated blob. No effect on the dev server.
export default defineConfig({
  plugins: [react()],
  server: { allowedHosts: true },
  build: { rollupOptions: { output: { inlineDynamicImports: true } } },
});
