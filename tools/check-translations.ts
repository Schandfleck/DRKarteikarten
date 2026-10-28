/**
 * Prüft die Übersetzungen beider Oberflächen (läuft mit "npm test"):
 *  1. Jeder Text in t('…') / tKey('…') hat einen arabischen Eintrag in locales/ar.ts.
 *  2. Kein deutscher Text steht unübersetzt direkt im JSX (z. B. <button>Speichern</button> oder title="…").
 *  3. Jede Protokoll-Aktion des Servers ist in der Betreuer-Website übersetzt.
 * Mit --list werden alle gefundenen Texte ausgegeben.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const listMode = process.argv.includes('--list');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((f) => {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) return f.name === 'locales' ? [] : sourceFiles(p);
    return /\.tsx?$/.test(f.name) && f.name !== 'i18n.ts' ? [p] : [];
  });
}

/** Erstes Argument von t(…)/tKey(…), wenn es ein fester Text ist. */
function translatableTexts(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/\bt(?:Key)?\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) out.push(m[2]!.replace(/\\(['"\\])/g, '$1'));
  return out;
}

/** Deutsche Texte, die direkt im JSX stehen statt in t(…). */
function hardcodedTexts(code: string): string[] {
  const found: string[] = [];
  const jsx = code.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
  // Text direkt nach einem JSX-Tag (<span …> oder </b>) bis zum nächsten Tag; Code-Zeichen wie ; = ( schließen TypeScript-Generics aus
  for (const m of jsx.matchAll(/(?:<[A-Za-z][\w.]*(?:\s[^<>]*?)?>|<\/[\w.]+>)([^<>{}]*)(?=<|\{)/g)) {
    const text = m[1]!.trim();
    if (/[A-Za-zÄÖÜäöüß]{2,}/.test(text) && !/[;=()|&?]/.test(text)) found.push(text);
  }
  for (const m of jsx.matchAll(/\s(title|placeholder|aria-label|label|hint|alt)="([^"]*[A-Za-zÄÖÜäöüß]{2,}[^"]*)"/g)) found.push(`${m[1]}="${m[2]}"`);
  return found;
}

const auditActions = (() => {
  const dir = path.join(root, 'server', 'src');
  const names = new Set<string>();
  const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((f) => {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.ts')) for (const m of fs.readFileSync(p, 'utf8').matchAll(/audit\((?:me|null), '([^']+)'/g)) names.add(m[1]!);
  });
  walk(dir);
  return [...names];
})();

let problems = 0;
for (const app of ['kinder', 'betreuer']) {
  const src = path.join(root, 'apps', app, 'src');
  const { ar } = (await import(path.join(src, 'locales', 'ar.ts'))) as { ar: Record<string, string> };
  const used = new Set<string>();
  const hardcoded: string[] = [];
  for (const file of sourceFiles(src)) {
    const code = fs.readFileSync(file, 'utf8');
    translatableTexts(code).forEach((t) => used.add(t));
    if (file.endsWith('.tsx')) hardcodedTexts(code).forEach((t) => hardcoded.push(`${path.relative(root, file)}: ${t}`));
  }
  if (app === 'betreuer') auditActions.forEach((a) => used.add(a));

  const missing = [...used].filter((t) => !(t in ar)).sort();
  const unused = Object.keys(ar).filter((k) => !used.has(k)).sort();
  if (listMode) console.log(`\n# ${app}: ${used.size} Texte\n${[...used].sort().map((t) => `  ${JSON.stringify(t)}`).join('\n')}`);

  console.log(`${app}: ${used.size} Texte, ${missing.length} ohne arabische Übersetzung, ${hardcoded.length} unübersetzt im Code`);
  for (const t of missing) console.log(`  fehlt in apps/${app}/src/locales/ar.ts: ${JSON.stringify(t)}`);
  for (const h of hardcoded) console.log(`  fest im Code statt t(…): ${h}`);
  for (const u of unused) console.log(`  (Hinweis) nicht mehr verwendet: ${JSON.stringify(u)}`);
  problems += missing.length + hardcoded.length;
}

if (problems > 0) {
  console.error(`\n${problems} Übersetzungsproblem(e) gefunden.`);
  process.exit(1);
}
console.log('Übersetzungen vollständig.');
