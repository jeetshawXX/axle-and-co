import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on :5000; Vite proxies to it so the browser sees one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
      '/sitemap.xml': 'http://localhost:5000',
      '/robots.txt': 'http://localhost:5000'
    }
  }
});
