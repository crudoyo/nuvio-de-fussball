# Nuvio · Deutscher Fußball (Cloudflare Workers)

**Version 0.2.1 · Community-Prototyp**. Eigenständiges [Stremio-Addon](https://stremio.github.io/stremio-addon-sdk/protocol.html) für Nuvio TV. Die Daten stammen von [OpenLigaDB](https://openligadb.de/) (ODbL).

## Funktionen

- Je Wettbewerb ein Katalog: Bundesliga, 2. Bundesliga, 3. Liga, DFB-Pokal, Frauen-Bundesliga, Frauen-Pokal, Supercup und automatisch erkannte deutsche Regional-, Ober- und Amateurligen.
- Jedes Spiel als eigene Kachel mit Anstoßzeit (Europe/Berlin), Gegnern und Status; 24 Stunden zurück und 30 Tage voraus.
- Konfigurationsseite `/configure`, auf der bis zu drei **exakte HTTPS-Manifest-URLs** bereits installierter Sport-Add-ons hinterlegt werden können.
- Zur Wiedergabe werden mögliche Events in den Katalogen der gewählten Sport-Add-ons gesucht und deren HTTP(S)-Streams übernommen, **nur bei eindeutigem Mannschaftsabgleich**. Keine direkten DaddyLive-Scraper, keine P2P- oder Torrent-Unterstützung.
- Unabhängig von Kaptain und AIOMetadata; keine Datenbank erforderlich.

### Einschränkungen

- **Noch kein Live-Test** gegen produktive Add-ons oder Fire TV. Es ist nicht garantiert, dass Sports Streams/Nuvio Live Sports Spiele auf diese Weise verfügbar machen. Bei nicht passenden Event-IDs bleiben Streams leer.
- Dynamische unterklassige Ligen hängen von OpenLigaDB ab und können fehlen oder leere Kataloge enthalten. Die Core-Wettbewerbe sind selbst dann sichtbar, wenn OpenLigaDB dafür keine Daten liefert.
- Die Poster werden als **SVG** erzeugt. Nicht jeder Nuvio-Player unterstützt SVG-Bilder; in diesem Fall bleiben Poster leer, aber Titel und Spieltexte funktionieren weiter.
- `externalUrl`-Streams können Drittanbieterplayer öffnen, deren P2P-Verhalten dieses Add-on nicht kontrolliert. Prüfe die Rechte zur Wiedergabe der angebotenen Inhalte.
- URLs mit Zugangstoken sollten nicht öffentlich geteilt werden; sie sind in der personalisierten Manifest-Adresse enthalten.

## Deployment über Cloudflare Workers

1. Dieses öffentliche Repository in Cloudflare unter **Workers & Pages → Create application → GitHub** auswählen.
2. Als Worker-Name **`nuvio-de-fussball`** verwenden (entspricht `wrangler.jsonc`).
3. Deploy-Befehl **`npx wrangler deploy`**; kein Build-Befehl nötig. Nach dem Verknüpfen werden Änderungen an GitHub automatisch ausgerollt.
4. Den erhaltenen HTTPS-Endpunkt öffnen, z.B. `https://nuvio-de-fussball.DEINE-SUBDOMAIN.workers.dev/configure`.
5. Optional Manifest-URLs von **Sports Streams** und **Nuvio Live Sports** einfügen. Auf **Installations-URL erstellen** klicken.
6. Den generierten `https://.../manifest.json`-Link in **Nuvio → Add-ons** einfügen, nicht bei JavaScript-Plugins.

Wenn Nuvio deine Startseite mit Fußball-Reihen füllt, sortiere oder deaktiviere die Home-Kataloge in Nuvio – das Add-on muss dafür nicht entfernt werden.

## Lokale Entwicklung

Node.js 20+:

```bash
npm install
npm test
npx wrangler dev
```

Veröffentlichen: `npx wrangler deploy` (Cloudflare-Login erforderlich).

## Umgebungsvariablen

- `SEASON`: Startjahr der Saison, standardmäßig `2026` in `wrangler.jsonc` – **im Sommer 2027 aktualisieren**. Wenn die Variable fehlt, wird das Saisonjahr automatisch anhand des Datums ausgewählt.
- `EXTRA_LEAGUES`: weitere OpenLigaDB-Ligen als `kurz:Name,kurz:Name`, z.B. `rlw:Regionalliga West`.
- `UPSTREAM_MANIFESTS`: optionale, kommagetrennte HTTPS-Manifest-URLs (besser `/configure` verwenden).

## Endpunkte

- `/configure` – Webkonfigurator
- `/manifest.json` – Add-on-Manifest ohne Streams
- `/u/<Konfiguration>/manifest.json` – individuelles Manifest
- `/catalog/tv/defootball_bl1.json` – Bundesliga-Spielkatalog
- `/meta/tv/defootball_bl1_<MatchID>.json` – Begegnungsdetails
- `/stream/tv/defootball_bl1_<MatchID>.json` – Streams, falls zugeordnet
- `/poster/bl1/<MatchID>.svg` – Poster-SVG
- `/health` – Status

**Datenschutz / Disclaimer:** Kein offizielles Angebot von Nuvio, Stremio, DFB oder OpenLigaDB. Die Quelldienste und deren Zugriffsberechtigungen bleiben unabhängig. Dieses Projekt bietet keine unautorisierten Streamquellen und versucht nicht, Geoblocking, DRM oder CAPTCHA zu umgehen.
## GitHub Actions / Prüfung

Bei jedem Push auf `main` prüft der Workflow [Worker checks](.github/workflows/ci.yml) die Node-Tests (`npm test`) und erstellt einen Cloudflare-Worker-Testbuild (`npx wrangler deploy --dry-run --outdir dist`). Das **deployt nicht selbst** – für eine öffentliche Nuvio-Manifest-URL muss der Worker einmal über die Cloudflare-GitHub-Integration mit diesem Repository verbunden werden. Das gelingt unter **Workers & Pages → Create → Import a repository**, Produktionsbranch `main`, Deploy-Befehl `npx wrangler deploy`. Den Worker-Endpunkt danach über `/health` und `/manifest.json` kontrollieren.
