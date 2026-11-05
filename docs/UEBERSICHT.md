# Karteikarten

Lernsystem mit zwei Oberflächen und einem gemeinsamen Server:

| Teil | Adresse | Für wen |
|---|---|---|
| **Kinder-App** (PWA, installierbar auf iOS/Android) | `https://<domain>/` | Kinder lernen ihre Karteikarten |
| **Betreuer-Website** | `https://<domain>/betreuer/` | Betreuer verwalten Kinder, Stapel und Karten |

**Ein Link für alle:** Kinder und Betreuer melden sich gemeinsam unter `https://<domain>/` an. Der Server erkennt am Konto, wer sich anmeldet; Betreuer werden automatisch zur Betreuer-Website weitergeleitet.
| **Server + Datenbank** | `https://<domain>/api/…` | speichert alles zentral |

## Funktionen

**Betreuer-Website**
- Kinderkonten anlegen (Benutzername + Passwort), Passwort neu vergeben, sperren/entsperren, deaktivieren, löschen
- Kartenstapel anlegen, bearbeiten, kopieren (z. B. als Vorlage für eine andere Ausbildung)
- Drei Kartentypen, frei wählbar pro Karte:
  - **Vorder-/Rückseite**: Text und/oder Bild, das Kind bewertet sich selbst
  - **Antwort eintippen**: automatische Prüfung, mehrere richtige Schreibweisen möglich
  - **Multiple Choice**: eine oder mehrere richtige Antworten
- Jede Karte kann Bilder und eine kurze Erklärung haben; die Live-Vorschau zeigt, wie sie in der App aussieht
- Stapel einzeln pro Kind zuteilen, Lernfortschritt pro Kind und Karte einsehen
- Rollen: **Admin** (verwaltet zusätzlich Betreuer-Konten und sieht das Protokoll) und **Betreuer**
- Protokoll: wer hat wann was geändert

**Kinder-App**
- Lernen in Runden, bis alle Karten einmal richtig beantwortet sind. Falsch beantwortete Karten kommen in die nächste Runde.
- Der Lernstand liegt auf dem Server. Wer die App schließt, macht später genau dort weiter (auch auf einem anderen Gerät).
- Über „Zum Startbildschirm hinzufügen“ wie eine normale App installierbar

**Sprachen**
- Deutsch und Arabisch (mit gespiegeltem Layout von rechts nach links), umschaltbar über das Zahnrad bzw. „Einstellungen“
- Die Sprache wird im Konto gespeichert und gilt auf allen Geräten; vor der Anmeldung merkt sich das Gerät die Auswahl
- Texte stehen in `apps/*/src/locales/ar.ts` und `server/src/lib/i18n.ts`; `npm test` meldet fehlende Übersetzungen
- Karteninhalte (Fragen, Antworten) übersetzt die App nicht – sie erscheinen so, wie der Betreuer sie eingibt

## Technik

- **Node.js 26** (TypeScript läuft direkt ohne Build-Schritt)
- **SQLite** als Datenbank (eingebaut in Node, eine einzige Datei)
- **Argon2id** für Passwörter (eingebaut in Node)
- **Express** (Server), **Preact + Vite** (Oberflächen; Preact ist ein React-Ersatz mit gleicher API und einem Bruchteil der Größe), Material Design 3
- Nur zwei Server-Abhängigkeiten: `express`, `zod`. Die Oberflächen laden je ca. 15–26 KB JavaScript (gzip).

Später kann eine **native App** (App Store / Play Store) dazukommen, ohne den Server umzubauen: Die Anmeldung unterstützt dafür bereits Tokens (`client: "native"` → `Authorization: Bearer …`).

## Lokal ausprobieren

```bash
npm install
```

```bash
npm run build
```

```bash
npm run cli -- demo
```

```bash
npm start
```

`demo` legt einen Admin, ein Kind und einen Beispielstapel an. Die Zugangsdaten stehen danach in `data/DEMO-ZUGANG.txt`. Für ein echtes System stattdessen `npm run cli -- create-admin` verwenden.

Entwicklung mit automatischem Neuladen: `npm run dev:server` plus `npm run dev:betreuer` (Port 5173) oder `npm run dev:kinder` (Port 5174).

Prüfungen: `npm test` (45 automatische Tests, davon 21 reine Sicherheitstests in `server/test/security.test.ts`, plus Prüfung der Übersetzungen) und `npm run typecheck`.

## Auf einem Server betreiben (Docker)

Schritt-für-Schritt-Anleitung in der [README](../README.md). Kurzfassung: `.env` und `Caddyfile` mit der Domain füllen, `chown 1000:1000 data`, `docker compose up -d --build`, Admin mit `docker compose exec app node server/src/cli.ts create-admin` anlegen.

## Verwaltungsbefehle

| Befehl | Zweck |
|---|---|
| `create-admin [name]` | Admin-Konto anlegen |
| `reset-password <name>` | Passwort eines Kontos neu setzen (z. B. wenn der Admin seins vergessen hat) |
| `backup [ordner]` | Sicherung von Datenbank und Bildern |
| `demo` | Beispieldaten (nur in leerer Datenbank) |

Lokal: `npm run cli -- <befehl>`. In Docker: `docker compose exec app node server/src/cli.ts <befehl>`.

## Projektaufbau

```
server/            Server (API, Datenbank, Sicherheit)
  src/db.ts          Datenbank-Schema
  src/security/      Passwörter, Anmeldung, Schutz vor Durchprobieren
  src/routes/        Schnittstellen (auth, staff, children, decks, child, uploads, audit)
  src/lib/study.ts   Lernlogik „Runden bis alles richtig“
  test/              automatische Tests
apps/betreuer/     Betreuer-Website (React)
apps/kinder/       Kinder-App (React, PWA)
assets/logo.svg    EINZIGE Vorlage für Logo und App-Symbole (PNGs entstehen beim Bauen)
tools/             Build-Helfer: App-Symbole erzeugen, Lizenzdatei erstellen
data/              ALLE gespeicherten Daten (nicht im Git!)
docs/              Erklärungen zu Daten & Sicherheit
```

Mehr zu Speicherorten, Sicherheit und Backups: [DATEN-UND-SICHERHEIT.md](DATEN-UND-SICHERHEIT.md)
