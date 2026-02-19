import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['node-pty', 'better-sqlite3'],
    },
  },
});
