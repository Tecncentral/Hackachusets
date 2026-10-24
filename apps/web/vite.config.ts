import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// /api → core platform (:3001). /assistant → correction assistant service (:3002), used only for audio transcription.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/assistant': { target: 'http://127.0.0.1:3002', rewrite: path => path.replace(/^\/assistant/, '') }
    }
  }
});
