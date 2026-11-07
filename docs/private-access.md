# Privater Einladungsmodus

Im privaten Modus dient der Worker nur dem eingeladenen Freundeskreis. Unter **`/admin`** meldet sich der Betreiber mit einem zufällig generierten Verwaltungsschlüssel an. Freunde brauchen kein Konto. Die normale öffentliche Worker-Konfiguration ohne private Bindungen oder Secret bleibt als eigener Betriebsmodus verfügbar.

## Freunde und Geräte verwalten

1. Unter **Einladung bereitstellen** Name, Schlüssellimit und Gültigkeit eintragen. Standard sind zwei Schlüssel und 72 Stunden Gültigkeit. Mit **Immer** bleibt die Einladung bis zum Einlösen oder Zurückziehen gültig.
2. Den angezeigten Link kopieren und privat weitergeben. Er reserviert einen Geräteplatz und wird aus Sicherheitsgründen nur bei Erstellung im Klartext angezeigt.
3. Der Freund öffnet den Link beispielsweise am Handy und wählt seine Kataloge. Erst der Klick auf **Einladung einlösen** mit gültiger Auswahl verbraucht die Einladung.
4. Für den TV **URL kopieren** wählen und die HTTPS-Adresse dort unter Add-ons importieren. Die App-Knöpfe installieren auf dem aktuell verwendeten Gerät. Nuvio, Stremio und der manuelle Import verwenden denselben Geräteschlüssel. Eine Änderung über **Auswahl bearbeiten** behält den Schlüssel und erzeugt eine URL für die geänderte Auswahl.
5. Für einen zweiten Schlüssel **Weitere Einladung** wählen. Offene Einladungen reservieren Plätze. Nach Ablauf oder Rücknahme ist der Platz wieder frei. Ein aktiver Schlüssel kann einzeln gesperrt werden. Die Sperre eines Freundes pausiert alle seine Schlüssel und Einladungen, ohne individuell widerrufene Schlüssel wiederherzustellen.

Das Limit zählt ausgegebene Schlüssel und offene Einladungen. App-Synchronisierung oder ein kopierter Importlink kann denselben Schlüssel auf mehrere Geräte übertragen. Der Worker sperrt seine eigenen Abrufe. Bereits gepufferte Medien und bereits ausgegebene Links zu Drittanbietern bleiben davon unberührt.

## Lokal testen

Mit installierten Projektabhängigkeiten:

```sh
npm test
npm run test:private
```

Der zweite Befehl startet einen isolierten lokalen Worker mit echter lokaler D1-Datenbank. Er prüft Ablauf, konkurrierende Aktivierungen und Platzreservierungen, geschlossene öffentliche Routen, beide App-Link-Formate und Sperren. Es werden nur temporäre Testdaten erzeugt.

Für einen manuellen Test zuerst in einer lokalen **ignorierten** Datei `.dev.vars` den Schlüssel `PRIVATE_ADMIN_KEY` hinterlegen. Einen neuen Wert mit `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` erzeugen. Keine echten Zugangsschlüssel in Git oder in einen öffentlichen Chat kopieren.

```sh
npx wrangler d1 migrations apply PRIVATE_DB --local --config wrangler.private.jsonc
npx wrangler dev --local --config wrangler.private.jsonc
```

Dann `http://127.0.0.1:8787/admin` öffnen. Lokale Importlinks sind für den HTTP-Test gedacht. Der echte App-Import benötigt den erreichbaren HTTPS-Worker.

## Live schalten

Die mitgelieferte `wrangler.private.jsonc` ist eine lokale Testkonfiguration. Für den bestehenden Live-Worker in Cloudflare eine D1-Datenbank anlegen. Die Bindung `PRIVATE_DB` mit der echten Datenbank-ID, `migrations_dir: "migrations/private"` und `PRIVATE_ACCESS: "true"` müssen in die **tatsächlich vom Produktionsbuild verwendete** Wrangler-Konfiguration. Den vorhandenen Worker-Namen beibehalten und Vorschau-URLs deaktivieren oder ebenfalls absichern.

1. Migration auf die richtige Datenbank anwenden: `npx wrangler d1 migrations apply PRIVATE_DB --remote`.
2. Einen eigenen zufälligen 32-Byte-Schlüssel erzeugen und als Cloudflare Secret `PRIVATE_ADMIN_KEY` hinterlegen, zum Beispiel mit `npx wrangler secret put PRIVATE_ADMIN_KEY`. Die Datenbank-ID ist keine Anmeldeinformation; der Schlüssel bleibt außerhalb von Git.
3. In GitHub Actions die Repository-Variable `WORKER_SMOKE_MODE` auf `private` setzen. Dann die vorbereitete Version über den bestehenden Worker-Build bereitstellen. Private Bindung, Secret und Modus bei künftigen Releases beibehalten. Ein Rollback auf eine Version **vor** dem Einladungsmodus würde dessen Schutz entfernen.
4. Über HTTPS `/admin` anmelden und den eigenen ersten Geräteplatz anlegen. Ohne Schlüssel müssen `/configure`, `/manifest.json`, alte `/u/…`-Links und `/daddy/…` 404 liefern. Bestehende öffentliche Installationen durch persönliche Links ersetzen. Einen App- und HLS-Test am Zielgerät machen.

Die Authentifizierung läuft vor Cache und Quellenabrufen. D1 speichert nur die Hashes der Einladungen und Geräteschlüssel. Die Platzvergabe und Aktivierung verwenden bedingte SQL-Schreibzugriffe; parallele Abrufe können weder eine Einladung zweimal einlösen noch das Kontingent überbuchen. Admins erhalten ein signiertes, acht Stunden gültiges Cookie. Private Antworten tragen `no-store`; HTML-Seiten senden Referer nur an denselben Host, damit ihre Formulare den [für den CSRF-Schutz geprüften Origin](https://fetch.spec.whatwg.org/#append-a-request-origin-header) behalten. Keine vollständigen URLs mit Schlüsseln in externe Logs übernehmen. Eigene HLS-Playlists und Segmente bleiben unter demselben Schlüsselpfad und prüfen Sperren vor dem Abruf.
