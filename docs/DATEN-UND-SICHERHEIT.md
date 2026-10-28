# Wo wird was gespeichert – und wie sicher?

## Kurz gesagt

**Alles liegt in einem einzigen Ordner: `data/`.**
Wer diesen Ordner sichert, hat alles gesichert. Wer ihn löscht, hat alles gelöscht.

```
data/
├── karteikarten.db        ← die Datenbank (eine Datei)
├── karteikarten.db-wal    ← Zwischenspeicher der Datenbank (gehört dazu)
├── karteikarten.db-shm    ← Zwischenspeicher der Datenbank (gehört dazu)
└── uploads/               ← hochgeladene Bilder der Karten
    ├── 3f9a…c1.jpg
    └── …
```

- **Lokal** liegt der Ordner im Projekt: `DRKarteikarten/data/`
- **Auf dem Server (Docker)** liegt er neben der `docker-compose.yml`, ebenfalls als `data/`. Im Container heißt er `/data`.

Der Ordner steht in `.gitignore`. Echte Daten landen also nie im Code-Repository.

## Was steht in der Datenbank?

Die Datenbank ist wie eine Excel-Datei mit mehreren Tabellenblättern:

| Tabelle | Inhalt |
|---|---|
| `users` | Alle Konten (Admins, Betreuer, Kinder): Name, Benutzername, Rolle, **Passwort-Hash** |
| `sessions` | Wer gerade angemeldet ist (nur ein Fingerabdruck des Anmelde-Tokens) |
| `decks` | Kartenstapel (Titel, Beschreibung) |
| `cards` | Die einzelnen Karten: Typ, Frage, Antwort, richtige Antworten, Verweis auf Bilder |
| `images` | Liste der hochgeladenen Bilder (die Dateien selbst liegen in `uploads/`) |
| `deck_assignments` | Welches Kind welchen Stapel lernen soll |
| `study_runs` + `run_cards` | Lernstand: Runde, welche Karte richtig/falsch war, wie oft |
| `audit_log` | Protokoll: wer hat wann was geändert |

Über Kinder wird nur gespeichert: **Name (Vor- oder Spitzname reicht), Benutzername, Passwort-Hash und der Lernstand.** Kein Geburtsdatum, keine Adresse, keine E-Mail.

## Wie werden Passwörter gespeichert?

**Gar nicht – gespeichert wird nur ein „Hash“.**

Ein Hash ist wie ein Fingerabdruck: Aus dem Passwort lässt sich der Fingerabdruck leicht berechnen, aus dem Fingerabdruck aber **nicht** das Passwort.

```
Passwort:  Tiger-Blau-Mond-472
              │
              ▼   Argon2id (+ zufälliges „Salz“)
In der DB: $argon2id$v=19$m=65536,t=3,p=4$Xk3…$9fA…
```

Bei der Anmeldung wird das eingegebene Passwort genauso umgerechnet und mit dem gespeicherten Fingerabdruck verglichen.

Warum das sicher ist:
- **Argon2id** ist das aktuell empfohlene Verfahren (Gewinner der Password Hashing Competition, empfohlen von OWASP und BSI).
- Jede Berechnung braucht absichtlich **64 MB Arbeitsspeicher und ca. 0,1 Sekunden**. Für eine Anmeldung merkt man das nicht. Wer aber eine gestohlene Datenbank durchprobieren will, braucht dadurch extrem lange.
- Jedes Passwort bekommt ein **zufälliges Salz**. Zwei Kinder mit demselben Passwort haben trotzdem völlig unterschiedliche Hashes.
- Niemand kann ein Passwort nachschauen: kein Betreuer, kein Admin, kein Entwickler. Deshalb wird das Passwort beim Anlegen **einmalig** angezeigt (mit „Drucken“-Knopf für einen Zugangszettel). Vergessen → einfach ein neues vergeben.

Mindestlängen: Kinder 6 Zeichen, Betreuer/Admins 10 Zeichen. Der Knopf „Vorschlag“ erzeugt für Kinder gut merkbare Passwörter wie `Tiger-Blau-Mond-472`.

## Weitere Schutzmaßnahmen

| Schutz | Was es bringt |
|---|---|
| **Sperre nach 5 Fehlversuchen** (15 Minuten) | Passwörter können nicht durchprobiert werden. Ein Betreuer kann sofort entsperren. |
| **Bremse pro IP-Adresse** (30 Versuche / 15 Min.) | zusätzlich gegen massenhaftes Ausprobieren |
| **Anmelde-Cookie: HttpOnly, Secure, SameSite=Strict** | Das Cookie geht nur verschlüsselt über HTTPS, ist für Skripte unsichtbar und wird nie von fremden Seiten mitgeschickt |
| **Prüfung der Herkunft jeder Änderung** | fremde Webseiten können keine Aktionen auslösen (CSRF-Schutz) |
| **Rollen werden auf dem Server geprüft** | Ein Kind kann technisch keine Betreuer-Funktion aufrufen, auch nicht mit Tricks im Browser |
| **Lösungen erst nach dem Antworten** | Bei Eingabe- und Auswahlkarten schickt der Server die Lösung erst nach der Antwort |
| **Bilder werden am Inhalt geprüft** | Nur echte PNG/JPG/WEBP/GIF-Bilder bis 5 MB. Zufällige Dateinamen. Ansehen nur für angemeldete Benutzer. |
| **Sicherheits-Header** (CSP, HSTS, Frame-Schutz) | erschwert Angriffe über eingeschleuste Skripte oder eingebettete Seiten |
| **„Angemeldet bleiben“ für Kinder wählbar** | Ohne Haken muss das Kind nach dem Schließen der App neu das Passwort eingeben; die Anmeldung läuft außerdem spätestens nach 2 Stunden ab. Mit Haken: 30 Tage (`SESSION_DAYS_CHILD`). |
| **Passwort-Reset und Deaktivierung melden überall ab** | alte Geräte verlieren sofort den Zugang |
| **Protokoll** | Nachvollziehbarkeit, wer was geändert hat (ohne Passwörter) |
| **Container läuft nicht als root, Port nur lokal** | Von außen ist nur Caddy (HTTPS) erreichbar |

## Backups

**Empfehlung: täglich automatisch sichern und die Sicherung auf einem anderen Gerät aufbewahren.**

```bash
docker compose exec app node server/src/cli.ts backup /data/backups
```

Das erzeugt `data/backups/karteikarten-<datum>/` mit einer sauberen Kopie der Datenbank und aller Bilder (auch im laufenden Betrieb). Für die tägliche Automatik eignet sich ein Cronjob auf dem Server, z. B. jede Nacht um 3 Uhr:

```
0 3 * * * cd /pfad/zum/projekt && docker compose exec -T app node server/src/cli.ts backup /data/backups
```

Achtung: `data/backups` liegt auf demselben Server. Kopiere die Sicherungen zusätzlich woandershin, z. B. mit dem Backup-Speicher des Hosters.

**Wiederherstellen:** Server stoppen (`docker compose down`), die Datei `karteikarten.db` und den Ordner `uploads/` aus der Sicherung nach `data/` kopieren, die alten `-wal`/`-shm`-Dateien löschen und wieder starten.

## Datenschutz (DSGVO) – Hinweise für die Firma

Das ist keine Rechtsberatung. Diese Punkte sollte die Firma aber klären:

- **Hoster in Deutschland/EU** wählen (z. B. Hetzner, IONOS) und mit ihm einen **Auftragsverarbeitungsvertrag (AVV)** abschließen.
- Die Verarbeitung ins **Verzeichnis der Verarbeitungstätigkeiten** aufnehmen und ggf. den Datenschutzbeauftragten einbinden.
- Kinder bzw. Sorgeberechtigte informieren, welche Daten gespeichert werden (siehe oben: Name, Benutzername, Lernstand).
- **Löschen:** „Kind löschen“ entfernt Konto, Zuteilungen und den gesamten Lernstand endgültig. Im Protokoll bleibt nur der Eintrag „Kind gelöscht (Name)“. Kopien in älteren Backups verschwinden erst, wenn diese Backups gelöscht werden.
- Nur so viele Daten eintragen wie nötig (Vorname oder Spitzname reicht).
