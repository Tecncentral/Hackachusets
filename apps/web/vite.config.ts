import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The opt-in development adapter bundles the platform's IncidentStore, which imports node:crypto.
  resolve: { alias: { 'node:crypto': fileURLToPath(new URL('./src/platform/crypto-shim.ts', import.meta.url)) } },
  // API port follows SCENEBRIEF_API_PORT so a second checkout can run beside a teammate's on 3001.
  server: { port: Number(process.env.SCENEBRIEF_WEB_PORT ?? 5173), strictPort: true, proxy: { '/api': `http://127.0.0.1:${process.env.SCENEBRIEF_API_PORT ?? 3001}` } }
});
