import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { thirdPartyLicenses } from '../../tools/third-party-licenses.ts';

export default defineConfig({
  base: '/betreuer/',
  plugins: [react(), thirdPartyLicenses('Karteikarten (Betreuer-Website)')],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
