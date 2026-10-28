import { argon2, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const argon2Async = promisify(argon2);

/**
 * Argon2id-Parameter nach RFC 9106 (zweite Empfehlung): 64 MiB Speicher, 3 Durchläufe, 4 Threads.
 * Ein Hash dauert dadurch absichtlich ca. 0,1 s – für eine Anmeldung unmerklich,
 * für jemanden, der gestohlene Hashes durchprobieren will, aber extrem teuer.
 */
const PARAMS = { memory: 65536, passes: 3, parallelism: 4, tagLength: 32 } as const;

async function derive(password: string, salt: Buffer, p: { memory: number; passes: number; parallelism: number; tagLength: number }) {
  return argon2Async('argon2id', {
    message: Buffer.from(password.normalize('NFC'), 'utf8'),
    nonce: salt,
    memory: p.memory,
    passes: p.passes,
    parallelism: p.parallelism,
    tagLength: p.tagLength,
  });
}

/**
 * Erzeugt einen Hash im Standard-Format (PHC), z. B.
 * $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
 * Das Passwort selbst wird nirgends gespeichert und lässt sich aus dem Hash nicht zurückrechnen.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, PARAMS);
  const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '');
  return `$argon2id$v=19$m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(stored);
  if (!match) return false;
  const [, m, t, p, saltB64, hashB64] = match;
  const expected = Buffer.from(hashB64!, 'base64');
  const actual = await derive(password, Buffer.from(saltB64!, 'base64'), {
    memory: Number(m),
    passes: Number(t),
    parallelism: Number(p),
    tagLength: expected.length,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Ein fester Dummy-Hash, damit eine Anmeldung mit unbekanntem Benutzernamen genauso lange dauert wie mit bekanntem. */
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}

export const PASSWORD_RULES = {
  staffMin: 10,
  childMin: 6,
  max: 200,
};

export function checkPasswordStrength(password: string, role: 'admin' | 'betreuer' | 'kind'): string | null {
  const min = role === 'kind' ? PASSWORD_RULES.childMin : PASSWORD_RULES.staffMin;
  if (password.length < min) return `Das Passwort muss mindestens ${min} Zeichen lang sein.`;
  if (password.length > PASSWORD_RULES.max) return 'Das Passwort ist zu lang.';
  if (role !== 'kind' && new Set(password).size < 5) return 'Das Passwort ist zu einfach.';
  return null;
}

// Gut lesbare, kindgerechte Wörter ohne Verwechslungsgefahr (kein l/I, 0/O usw.)
const WORDS = [
  'Apfel', 'Biber', 'Blitz', 'Dachs', 'Delfin', 'Drache', 'Eule', 'Fuchs', 'Gans', 'Igel',
  'Kiwi', 'Koala', 'Komet', 'Krake', 'Luchs', 'Mango', 'Mond', 'Otter', 'Panda', 'Pinguin',
  'Rabe', 'Rakete', 'Robbe', 'Sonne', 'Stern', 'Tiger', 'Wal', 'Wolke', 'Zebra', 'Pirat',
];
const COLORS = ['Blau', 'Gelb', 'Gruen', 'Rot', 'Lila', 'Bunt', 'Gold', 'Silber', 'Mint', 'Orange'];

/** Vorschlag für ein Kinder-Passwort, z. B. "Tiger-Blau-Mond-472" – leicht zu merken, schwer zu erraten (~8 Mio. Möglichkeiten). */
export function generateChildPassword(): string {
  const pick = <T>(list: T[]) => list[randomInt(list.length)];
  return `${pick(WORDS)}-${pick(COLORS)}-${pick(WORDS)}-${randomInt(100, 1000)}`;
}
