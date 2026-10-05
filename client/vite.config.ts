import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    fs: { allow: ['..'] }, // allow importing ../shared
  },
  build: { chunkSizeWarningLimit: 2000 }, // Phaser itself is ~1 MB
});
