import { defineConfig } from 'vite';

// Standalone MCP server — runs as a child process spawned by Claude Code,
// NOT as part of the Electron main process.
export default defineConfig({
  build: {
    // Don't clear the output directory — main.js is already there from the main build
    emptyOutDir: false,
    rollupOptions: {
      external: (id) => id === 'zod' || id.startsWith('@modelcontextprotocol/'),
    },
  },
});
