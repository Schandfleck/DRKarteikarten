import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Vite-Plugin: erzeugt beim Bauen "lizenzen.txt" mit Copyright- und Lizenztexten aller Pakete,
 * die tatsächlich im ausgelieferten Code stecken (Pflicht bei MIT/ISC/BSD).
 * Bricht den Build ab, wenn ein Paket eine nicht freigegebene Lizenz hat (z. B. GPL).
 */

/** Freizügige Lizenzen, die ohne Offenlegung des eigenen Codes genutzt werden dürfen. */
const ALLOWED = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'Unlicense', 'CC0-1.0']);
const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;
const NM = `${path.sep}node_modules${path.sep}`;

interface PackageInfo {
  name: string;
  version: string;
  license: string;
  homepage: string;
  texts: string[];
}

/** /…/node_modules/@scope/name/dist/x.js → /…/node_modules/@scope/name */
function packageRoot(moduleId: string): string | null {
  const file = moduleId.replace(/^\0/, '').split('?')[0]!;
  const idx = file.lastIndexOf(NM);
  if (idx < 0) return null;
  const parts = file.slice(idx + NM.length).split(path.sep);
  const name = parts[0]!.startsWith('@') ? `${parts[0]}${path.sep}${parts[1]}` : parts[0]!;
  return file.slice(0, idx + NM.length) + name;
}

function readPackage(root: string): PackageInfo {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const license = typeof pkg.license === 'object' ? pkg.license.type : (pkg.license ?? 'UNBEKANNT');
  const texts = fs.readdirSync(root)
    .filter((f) => LICENSE_FILE.test(f) && fs.statSync(path.join(root, f)).isFile())
    .sort()
    .map((f) => fs.readFileSync(path.join(root, f), 'utf8').trim());
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  return { name: pkg.name, version: pkg.version, license, homepage: pkg.homepage ?? repo ?? '', texts };
}

function isAllowed(license: string): boolean {
  // SPDX-Ausdrücke wie "(MIT OR Apache-2.0)": erlaubt, wenn mindestens eine Variante freigegeben ist
  return license.replace(/[()]/g, '').split(/\s+OR\s+/).some((l) => ALLOWED.has(l.trim()));
}

export function thirdPartyLicenses(appTitle: string): Plugin {
  return {
    name: 'kk-third-party-licenses',
    apply: 'build',
    generateBundle(_options, bundle) {
      const roots = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const id of output.moduleIds) {
          const root = packageRoot(id);
          if (root) roots.add(root);
        }
      }
      const packages = [...roots].map(readPackage).sort((a, b) => a.name.localeCompare(b.name));

      const forbidden = packages.filter((p) => !isAllowed(p.license));
      if (forbidden.length) {
        this.error(`Nicht freigegebene Lizenz im ausgelieferten Code: ${forbidden.map((p) => `${p.name} (${p.license})`).join(', ')}. ` +
          'Bitte prüfen, ob das Paket verwendet werden darf, und ggf. in tools/third-party-licenses.ts freigeben.');
      }
      for (const p of packages.filter((p) => p.texts.length === 0)) this.warn(`${p.name}: keine Lizenzdatei gefunden`);

      const line = '='.repeat(78);
      const text = [
        `${appTitle} – Lizenzen verwendeter Software`,
        '',
        'Diese Anwendung enthält die folgenden Open-Source-Pakete. Ihre Urheber und Lizenzen:',
        '',
        ...packages.map((p) => `  ${p.name} ${p.version} (${p.license})`),
        '',
        ...packages.flatMap((p) => [
          line,
          `${p.name} ${p.version}`,
          `Lizenz: ${p.license}${p.homepage ? `\nQuelle: ${p.homepage.replace(/^git\+/, '')}` : ''}`,
          line,
          '',
          p.texts.length ? p.texts.join('\n\n') : `(Keine Lizenzdatei im Paket enthalten – Lizenz laut Paketangabe: ${p.license})`,
          '',
        ]),
      ].join('\n');

      this.emitFile({ type: 'asset', fileName: 'lizenzen.txt', source: text });
    },
  };
}
