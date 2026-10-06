import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: resolve('client'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@auth0/auth0-react': resolve('tests/fixtures/auth0.tsx') } },
  define: {
    'import.meta.env.VITE_AUTH0_DOMAIN': JSON.stringify('fixture-issuer.invalid'),
    'import.meta.env.VITE_AUTH0_CLIENT_ID': JSON.stringify('test-only-client'),
    'import.meta.env.VITE_AUTH0_AUDIENCE': JSON.stringify('https://text-to-learn-test-api'),
    'import.meta.env.VITE_API_URL': JSON.stringify(''),
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:4174', '/__fixture': 'http://127.0.0.1:4174' },
  },
});
