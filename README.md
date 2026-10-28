# Karteikarten

Lernsystem mit zwei Oberflächen und einem gemeinsamen Server:

| Teil | Adresse | Für wen |
|---|---|---|
| **Kinder-App** (PWA, installierbar auf iOS/Android) | `https://<domain>/` | Kinder lernen ihre Karteikarten |
| **Betreuer-Website** | `https://<domain>/betreuer/` | Betreuer verwalten Kinder, Stapel und Karten |
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

## Technik

- **Node.js 26** (TypeScript läuft direkt ohne Build-Schritt)
- **SQLite** als Datenbank (eingebaut in Node, eine einzige Datei)
- **Argon2id** für Passwörter (eingebaut in Node)
- **Express** (Server), **React + Vite** (Oberflächen), Material Design 3
- Nur drei Server-Abhängigkeiten: `express`, `helmet`, `zod`

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

Prüfungen: `npm test` (17 automatische Tests für Sicherheit und Lernablauf) und `npm run typecheck`.

## Auf einem Server betreiben (Docker)

Voraussetzungen: Linux-Server mit Docker und eine Domain, die per DNS auf den Server zeigt.

1. Projekt auf den Server kopieren
2. `cp .env.example .env` und die Domain in `.env` sowie im `Caddyfile` eintragen
3. Starten (Caddy holt automatisch ein HTTPS-Zertifikat):
   ```bash
   docker compose up -d --build
   ```
4. Ersten Admin anlegen:
   ```bash
   docker compose exec app node server/src/cli.ts create-admin
   ```
5. `https://<domain>/betreuer/` öffnen und anmelden

**Updates:** neuen Code kopieren, dann erneut `docker compose up -d --build`. Datenbank-Änderungen laufen beim Start automatisch.

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
data/              ALLE gespeicherten Daten (nicht im Git!)
docs/              Erklärungen zu Daten & Sicherheit
```

Mehr zu Speicherorten, Sicherheit und Backups: [docs/DATEN-UND-SICHERHEIT.md](docs/DATEN-UND-SICHERHEIT.md)
