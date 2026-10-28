import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { thirdPartyLicenses } from '../../tools/third-party-licenses.ts';

export default defineConfig({
  base: '/',
  plugins: [react(), thirdPartyLicenses('Karteikarten (Kinder-App)')],
  server: {
    port: 5174,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
