import { defineConfig } from 'vite';
import { thirdPartyLicenses } from '../../tools/third-party-licenses.ts';

export default defineConfig({
  base: '/',
  // Preact statt React: gleiche API, ein Bruchteil der Größe. Der Code importiert weiter "react"/"react-dom".
  resolve: { alias: { 'react-dom/client': 'preact/compat/client', 'react-dom': 'preact/compat', react: 'preact/compat' } },
  oxc: { jsx: { importSource: 'preact' } },
  plugins: [thirdPartyLicenses('Karteikarten (Kinder-App)')],
  server: {
    port: 5174,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
