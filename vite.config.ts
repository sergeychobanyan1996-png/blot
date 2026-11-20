import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // In development the game server runs separately (`npm run server`); /ws is forwarded to it.
  server: {
    port: 5173,
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } },
    // Polling avoids watcher crashes (EBUSY) when files are rewritten on Windows.
    watch: { usePolling: true, interval: 300 },
  },
  test: { include: ['test/**/*.test.ts'] },
});
