/**
 * Erzeugt alle Logos und App-Symbole aus der einzigen Vorlage assets/logo.svg.
 * Läuft automatisch vor "dev" und "build" der Kinder-App; die Ergebnisse sind nicht im Git (siehe .gitignore).
 *
 *   SVG  → Tab-Symbol und Logo (Kinder-App und Betreuer-Website), gestochen scharf
 *   PNG  → nur dort, wo Apple/Android es verlangen (Startbildschirm-Symbole)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'assets', 'logo.svg'), 'utf8');
const kinder = path.join(root, 'apps', 'kinder', 'public');
const betreuer = path.join(root, 'apps', 'betreuer', 'public');

const match = /^([\s\S]*?<svg[^>]*>)([\s\S]*?)(<rect class="bg"[^>]*\/>)([\s\S]*)(<\/svg>\s*)$/.exec(source);
if (!match) throw new Error('assets/logo.svg: erwartet <svg> mit einem <rect class="bg" …/> als Hintergrund.');
const [, open, comments, bg, motif, close] = match;

/**
 * Variante ohne abgerundete Ecken (Apple und Android runden selbst ab) mit verkleinertem Motiv.
 * scale < 1 hält das Motiv in der "sicheren Zone", damit beim runden Zuschnitt nichts abgeschnitten wird.
 */
function fullBleed(scale: number): string {
  const square = bg!.replace(/\srx="[^"]*"/, '');
  return `${open}${square}<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${motif}</g>${close}`;
}

function png(svg: string, size: number, file: string): void {
  const data = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  fs.writeFileSync(file, data);
}

const cleanSvg = `${open}${bg}${motif}${close}`.replace(comments!, '\n');
// Nach "git clone" fehlt apps/betreuer/public/ (enthält nur erzeugte Dateien, Git speichert leere Ordner nicht)
for (const dir of [kinder, betreuer]) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(kinder, 'icon.svg'), cleanSvg);
fs.writeFileSync(path.join(betreuer, 'icon.svg'), cleanSvg);
png(cleanSvg, 192, path.join(kinder, 'icon-192.png'));
png(cleanSvg, 512, path.join(kinder, 'icon-512.png'));
png(fullBleed(0.8), 512, path.join(kinder, 'icon-maskable-512.png'));
png(fullBleed(0.9), 180, path.join(kinder, 'apple-touch-icon.png'));

console.log('App-Symbole aus assets/logo.svg erzeugt.');
