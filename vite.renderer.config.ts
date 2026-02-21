import { defineConfig } from 'vite';

export default defineConfig(async () => {
  // eslint-disable-next-line import/no-unresolved
  const { default: react } = await import('@vitejs/plugin-react');

  return {
    plugins: [react()],
  };
});
