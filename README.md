# Karteikarten

Lernsystem für Kinder mit Betreuer-Website und Kinder-App (installierbar auf dem Handy). Betreuer legen Kinderkonten und Kartenstapel an, Kinder lernen in Runden, bis alle Karten sitzen.

- Was das Programm kann und wie es technisch aufgebaut ist: [docs/UEBERSICHT.md](docs/UEBERSICHT.md)
- Wo Daten liegen und wie sie geschützt sind: [docs/DATEN-UND-SICHERHEIT.md](docs/DATEN-UND-SICHERHEIT.md)

# Installation auf einem Server – Schritt für Schritt

Diese Anleitung ist für jemanden geschrieben, der noch nie einen Server eingerichtet hat.
Alles, was du eintippen musst, steht in grauen Kästen. Tippe die Zeilen nacheinander ein und drücke jeweils Enter.

## Was du brauchst

1. **Einen Linux-Server** (z. B. bei Hetzner, IONOS oder Strato; Ubuntu reicht, 2 GB Arbeitsspeicher reichen).
2. **Eine Domain**, z. B. `karteikarten.meine-firma.de`, die auf die IP-Adresse des Servers zeigt
   (das stellt man beim Domain-Anbieter unter „DNS“ ein: ein **A-Eintrag** mit der Server-IP).
3. **Zugang zum Server** per SSH (Benutzername, Passwort oder Schlüssel – bekommt man vom Hoster).

Alles Weitere (HTTPS-Zertifikat, Datenbank usw.) richtet sich automatisch ein.

## Schritt 1: Auf dem Server anmelden

Am eigenen Rechner ein Terminal öffnen (Windows: PowerShell) und eintippen:

```bash
ssh root@<IP-Adresse-des-Servers>
```

## Schritt 2: Docker installieren (einmalig)

```bash
curl -fsSL https://get.docker.com | sh
```

Prüfen, ob es geklappt hat:

```bash
docker compose version
```

Es muss eine Versionsnummer erscheinen.

## Schritt 3: Firewall – nur Webseiten-Ports öffnen

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```

Damit ist von außen nur noch HTTPS (und dein SSH-Zugang) erreichbar. Die Datenbank ist von außen nie erreichbar.

## Schritt 4: Das Programm auf den Server kopieren

1. Am eigenen Rechner auf der GitHub-Seite des Projekts rechts unter **Releases** die neueste Version öffnen und die Datei `karteikarten-<version>.tar.gz` herunterladen.
2. Die Datei auf den Server hochladen (am eigenen Rechner ausführen, im Ordner mit der heruntergeladenen Datei):

   ```bash
   scp karteikarten-*.tar.gz root@<IP-Adresse-des-Servers>:/root/
   ```

3. Auf dem Server entpacken und in den Ordner wechseln:

   ```bash
   cd /root
   tar xzf karteikarten-*.tar.gz
   mv karteikarten-*/ karteikarten
   cd karteikarten
   ```

Alternative für Entwickler mit Zugriff auf das Repository: `git clone git@github.com:Schandfleck/DRKarteikarten.git karteikarten && cd karteikarten`

## Schritt 5: Domain eintragen

Zwei Dateien müssen deine Domain kennen.

1. Einstellungsdatei anlegen:

   ```bash
   cp .env.example .env
   nano .env
   ```

   Die Zeile `PUBLIC_ORIGIN=https://karteikarten.example.de` auf deine Domain ändern, z. B.
   `PUBLIC_ORIGIN=https://karteikarten.meine-firma.de`. Speichern mit `Strg+O`, Enter, beenden mit `Strg+X`.

2. HTTPS-Datei anpassen:

   ```bash
   nano Caddyfile
   ```

   In der ersten Zeile `karteikarten.example.de` durch deine Domain ersetzen. Speichern wie oben.

## Schritt 6: Datenordner anlegen

Hier landen später Datenbank und Bilder. Das Programm läuft aus Sicherheitsgründen nicht als Administrator, deshalb bekommt es den Ordner übertragen:

```bash
mkdir -p data
chown 1000:1000 data
```

## Schritt 7: Starten

```bash
docker compose up -d --build
```

Der erste Start dauert einige Minuten (das Programm wird gebaut). Danach läuft es dauerhaft, auch nach einem Neustart des Servers.

Nachsehen, ob alles läuft:

```bash
docker compose ps
```

Beide Zeilen (`app` und `caddy`) müssen `running` bzw. `Up` zeigen.

## Schritt 8: Ersten Admin anlegen

```bash
docker compose exec app node server/src/cli.ts create-admin
```

Benutzername, Anzeigename und ein Passwort (mindestens 10 Zeichen) eingeben. Das Passwort ist beim Tippen unsichtbar.

## Schritt 9: Fertig – ausprobieren

Im Browser `https://deine-domain.de` öffnen und mit dem Admin anmelden. Du landest automatisch auf der Betreuer-Website.
Dort legst du Betreuer, Kinder und Kartenstapel an. Kinder melden sich unter derselben Adresse an.

**Wichtig:** Die Seite funktioniert nur über `https://` (mit Schloss-Symbol). Über `http://` oder direkt über die IP-Adresse ist eine Anmeldung absichtlich nicht möglich.

---

## Später: Sicherung (Backup)

Tägliche Sicherung von Datenbank und Bildern nach `data/backups`:

```bash
docker compose exec app node server/src/cli.ts backup /data/backups
```

Automatisch jede Nacht um 3 Uhr:

```bash
(crontab -l 2>/dev/null; echo "0 3 * * * cd /root/karteikarten && docker compose exec -T app node server/src/cli.ts backup /data/backups") | crontab -
```

Den Ordner `data/backups` zusätzlich regelmäßig woandershin kopieren (z. B. auf einen Rechner in der Firma), damit die Sicherung einen Serverausfall überlebt.

## Später: Update einspielen

Das neue Release-Archiv wie in Schritt 4 herunterladen und hochladen, dann auf dem Server über den bestehenden Ordner entpacken und neu bauen:

```bash
cd /root
tar xzf karteikarten-*.tar.gz
cp -r karteikarten-*/. karteikarten/
rm -r karteikarten-*/
cd karteikarten
docker compose up -d --build
```

Die Daten bleiben erhalten, die Datenbank passt sich beim Start automatisch an.

## Wenn etwas nicht klappt

| Problem | Lösung |
|---|---|
| Seite lädt nicht | `docker compose logs --tail=50 app` und `docker compose logs --tail=50 caddy` zeigen die Fehlermeldung |
| Im Log steht `unable to open database file` und `app` startet ständig neu | Schritt 6 wurde übersprungen: `chown 1000:1000 data` ausführen, dann `docker compose restart app` |
| Kein HTTPS-Schloss / Zertifikatsfehler | Zeigt die Domain wirklich auf den Server? Sind Port 80 und 443 offen? Caddy versucht es automatisch weiter |
| „Server nicht erreichbar“ in der App | `docker compose ps` – läuft `app`? Sonst `docker compose restart app` |
| Admin-Passwort vergessen | `docker compose exec app node server/src/cli.ts reset-password <benutzername>` |
| Alles neu starten | `docker compose restart` |
| Alles stoppen | `docker compose down` (die Daten in `data/` bleiben) |

Mehr zu Speicherorten und Sicherheit: [docs/DATEN-UND-SICHERHEIT.md](docs/DATEN-UND-SICHERHEIT.md)
