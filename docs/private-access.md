# Privater Einladungsmodus

Im privaten Modus dient der Worker nur dem eingeladenen Freundeskreis. Unter **`/admin`** meldet sich der Betreiber mit einem zufällig generierten Verwaltungsschlüssel an. Freunde brauchen kein Konto. Die normale öffentliche Worker-Konfiguration ohne private Bindungen oder Secret bleibt als eigener Betriebsmodus verfügbar.

## Freunde und Geräte verwalten

1. Unter **Einladung bereitstellen** Name, Schlüssellimit und Gültigkeit eintragen. Standard sind zwei Schlüssel und 72 Stunden Gültigkeit. Mit **Immer** bleibt die Einladung bis zum Einlösen oder Zurückziehen gültig.
2. **Einladung kopieren** und die gemeinsame Adresse `/configure` mit dem persönlichen Passwort privat weitergeben. Das Passwort wird nur beim Erstellen angezeigt und reserviert einen Schlüsselplatz.
3. Der Freund meldet sich mit dem Passwort an. Es ist sofort verbraucht. Im selben Browser bleiben 30 Minuten, um die Kataloge auszuwählen und den Importlink zu erstellen. Bei Abbruch wird der Platz nach 30 Minuten wieder frei. Dafür ist ein neues Passwort nötig. Bereits ausgegebene `/e/…`-Links können wie bisher eingelöst werden.
4. Für den TV **URL kopieren** wählen und die HTTPS-Adresse dort unter Add-ons importieren. Die App-Knöpfe installieren auf dem aktuell verwendeten Gerät. Nuvio, Stremio und der manuelle Import verwenden denselben Geräteschlüssel. Eine Änderung über **Auswahl bearbeiten** behält den Schlüssel und erzeugt eine URL für die geänderte Auswahl.
5. Für einen zweiten Schlüssel **Weitere Einladung** wählen. Offene Einladungen reservieren Plätze. Nach Ablauf oder Rücknahme ist der Platz wieder frei. Ein aktiver Schlüssel kann einzeln gesperrt werden. Die Sperre eines Freundes pausiert alle seine Schlüssel und Einladungen, ohne individuell widerrufene Schlüssel wiederherzustellen.

Das Limit zählt ausgegebene Schlüssel und offene Einladungen. App-Synchronisierung oder ein kopierter Importlink kann denselben Schlüssel auf mehrere Geräte übertragen. Der Worker sperrt seine eigenen Abrufe. Bereits gepufferte Medien und bereits ausgegebene Links zu Drittanbietern bleiben davon unberührt.

## Lokal testen

Mit installierten Projektabhängigkeiten:

```sh
npm test
npm run test:private
```

Der zweite Befehl startet einen isolierten lokalen Worker mit echter lokaler D1-Datenbank. Er prüft Einmalpasswörter, Sitzungsablauf, konkurrierende Aktivierungen und Platzreservierungen, geschlossene öffentliche Routen, beide App-Link-Formate und Sperren. Es werden nur temporäre Testdaten erzeugt.

Für einen manuellen Test zuerst in einer lokalen **ignorierten** Datei `.dev.vars` den Schlüssel `PRIVATE_ADMIN_KEY` hinterlegen. Einen neuen Wert mit `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` erzeugen. Keine echten Zugangsschlüssel in Git oder in einen öffentlichen Chat kopieren.

```sh
npx wrangler d1 migrations apply PRIVATE_DB --local --config wrangler.private.jsonc
npx wrangler dev --local --config wrangler.private.jsonc
```

Dann `http://127.0.0.1:8787/admin` öffnen. Lokale Importlinks sind für den HTTP-Test gedacht. Der echte App-Import benötigt den erreichbaren HTTPS-Worker.

## Live schalten

Der Live-Worker `nuvio-de-fussball` nutzt `wrangler.jsonc` mit der D1-Datenbank `nuvio-de-fussball-access`. `wrangler.private.jsonc` dient lokalen Tests mit Zugangsschutz. `npm run dev` verwendet die separate lokale Umgebung ohne Passwortschutz.

1. Migration auf die richtige Datenbank anwenden: `npx wrangler d1 migrations apply PRIVATE_DB --remote`.
2. Bei der ersten Einrichtung einen zufälligen 32-Byte-Schlüssel als Cloudflare Secret `PRIVATE_ADMIN_KEY` hinterlegen. Der Schlüssel bleibt außerhalb von Git. Das Secret ist für Deployments verpflichtend.
3. Die Version über den bestehenden Worker-Build bereitstellen. GitHub Actions prüft den privaten Live-Worker nach dem Push auf `main`. Ein Rollback auf eine Version vor dem Einladungsmodus würde den Zugangsschutz entfernen.
4. Über HTTPS `/admin` anmelden und eine Einladung erstellen. `/configure` zeigt ohne Sitzung nur das Passwortformular. `/manifest.json`, alte öffentliche `/u/…`-Links und `/daddy/…` müssen ohne Schlüssel 404 liefern. Bestehende öffentliche Installationen durch persönliche Links ersetzen. Einen App- und HLS-Test am Zielgerät machen.

Die Authentifizierung läuft vor Cache und Quellenabrufen. D1 speichert nur die Hashes der Einladungen, Konfigurationssitzungen und Geräteschlüssel. Die bedingten SQL-Schreibzugriffe verhindern die doppelte Anmeldung und halten das Schlüssellimit auch bei parallelen Anfragen ein. Admins erhalten ein signiertes, acht Stunden gültiges Cookie. Private Antworten tragen `no-store`. HTML-Seiten senden Referer nur an denselben Host, damit ihre Formulare den für den CSRF-Schutz geprüften Origin behalten. Keine vollständigen URLs mit Schlüsseln in externe Logs übernehmen. Eigene HLS-Playlists und Segmente bleiben unter demselben Schlüsselpfad und prüfen Sperren vor dem Abruf.
