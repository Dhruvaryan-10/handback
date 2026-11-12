import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL('../dist', import.meta.url)), emptyOutDir: true },
  server: { port: 5173, host: true, proxy: { '/api': 'http://localhost:8787', '/demo-api': 'http://localhost:8787' } },
});
