import { useSyncExternalStore } from 'react';
import { ar } from './locales/ar.ts';

/*
 * Übersetzung: Im Code steht der deutsche Text, z. B. t('Abmelden') oder t('Runde {n}', { n: 2 }).
 * Für Arabisch wird er in locales/ar.ts nachgeschlagen; fehlt ein Eintrag, erscheint der deutsche Text.
 * tools/check-translations.ts (Teil von "npm test") meldet fehlende Einträge.
 *
 * Gespeichert wird die Sprache beim Konto (Server). Vor der Anmeldung merkt sich das Gerät die Auswahl.
 */
export type Language = 'de' | 'ar';
export const LANGUAGES: { code: Language; name: string }[] = [
  { code: 'de', name: 'Deutsch' },
  { code: 'ar', name: 'العربية' },
];

const STORAGE_KEY = 'kk-lang';
const listeners = new Set<() => void>();

function readStored(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'ar' ? 'ar' : 'de';
  } catch {
    return 'de';
  }
}

let current: Language = readStored();
applyToDocument();

function applyToDocument(): void {
  document.documentElement.lang = current;
  document.documentElement.dir = current === 'ar' ? 'rtl' : 'ltr';
}

export function getLanguage(): Language {
  return current;
}

export function setLanguage(lang: Language): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch { /* privater Modus o. Ä. */ }
  applyToDocument();
  listeners.forEach((l) => l());
}

/** Lässt die Komponente neu zeichnen, wenn die Sprache wechselt. */
export function useLanguage(): Language {
  return useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, getLanguage);
}

/** Markiert einen Text als übersetzbar, ohne ihn sofort zu übersetzen (für Konstanten; übersetzt wird später mit t()). */
export const tKey = (text: string): string => text;

export function t(text: string, params?: Record<string, string | number>): string {
  let out = current === 'ar' ? (ar[text] ?? text) : text;
  // Eingesetzte Werte (Namen, Zahlen) werden in Unicode-Isolatoren gepackt: So bleibt z. B. das "!" in
  // "مرحبًا Max!" an der richtigen Stelle, wenn lateinischer und arabischer Text gemischt werden.
  if (params) for (const [k, v] of Object.entries(params)) out = out.replaceAll(`{${k}}`, `\u2068${v}\u2069`);
  return out;
}

/** Für Datums-/Zahlenformat. Arabisch mit westlichen Ziffern, passend zu eingetippten Antworten wie "112". */
export function locale(): string {
  return current === 'ar' ? 'ar-u-nu-latn' : 'de-DE';
}
