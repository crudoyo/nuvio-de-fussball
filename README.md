# Nuvio · Deutscher Fußball (Cloudflare Workers)

**Version 0.3.0 · Community-Prototyp**. Eigenständiges [Stremio-Addon](https://stremio.github.io/stremio-addon-sdk/protocol.html) für Nuvio TV. Die Daten stammen von [OpenLigaDB](https://openligadb.de/) (ODbL).

## Funktionen

- Je Wettbewerb ein Katalog: Bundesliga, 2. Bundesliga, 3. Liga, DFB-Pokal, Frauen-Bundesliga, Frauen-Pokal, Supercup und automatisch erkannte deutsche Regional-, Ober- und Amateurligen.
- **Neu:** UEFA Champions League (OpenLigaDB, Kürzel `ucl`), Europa League und Conference League (ESPN-Soccer-Spielplan-Adapter, ohne API-Schlüssel).
- Jedes Spiel als eigene Kachel mit Anstoßzeit (Europe/Berlin), Gegnern und Status; 24 Stunden zurück und 30 Tage voraus. Die Poster enthalten, soweit verfügbar, beide **Vereinswappen** direkt in der SVG-Datei und kurze Mannschaftsnamen.
- Konfigurationsseite `/configure` für bis zu sechs **exakte HTTPS-Manifest-URLs** aus zusätzlichen Sport-Add-ons (insbesondere die persönliche Nuvio-Live-Sports- oder PenguPlay-Live-TV-URL).
- Der Worker prüft zusätzlich automatisch die öffentlichen Manifest-Schnittstellen von **Sports Streams** (`sports.highfly.dev`) und **PenguPlay** (`pengu.uk`). Zur Wiedergabe werden passende Spiele in `sport`- und `tv`-Katalogen ermittelt und direkte HTTP(S)-Streams der Anbieter übernommen, **nur bei eindeutigem Mannschaftsabgleich**. Keine eigenen DaddyLive-Scraper oder P2P-/Torrent-Auflösung. Identische Stream-URLs werden zusammengefasst.
- Unabhängig von Kaptain und AIOMetadata; keine Datenbank erforderlich.

### Einschränkungen

- **Noch kein Live-Test** der Streamzuordnung gegen die persönlichen Anbieter-Konfigurationen oder Fire TV. Nur eine erreichbare Schnittstelle mit Sport-Katalog, passenden Spielen und HTTP(S)-Direktstreams liefert Optionen. Manche Anbieter bieten nur Web-Player oder P2P, die hier nicht übernommen werden.
- Dynamische unterklassige Ligen hängen von OpenLigaDB ab und können fehlen oder leere Kataloge enthalten. Die Core-Wettbewerbe sind selbst dann sichtbar, wenn OpenLigaDB dafür keine Daten liefert.
- Die Poster werden als **SVG** mit eingebetteten PNG/JPEG/WebP/GIF-Vereinslogos erzeugt. Wenn ein Badge nicht abrufbar ist, erscheint ein Teamkürzel. Nicht jeder Nuvio-Player unterstützt SVG-Bilder; in diesem Fall bleiben Poster leer, aber Titel und Spieltexte funktionieren weiter.
- `externalUrl`-Streams können Drittanbieterplayer öffnen, deren P2P-Verhalten dieses Add-on nicht kontrolliert. Prüfe die Rechte zur Wiedergabe der angebotenen Inhalte.
- URLs mit Zugangstoken sollten nicht öffentlich geteilt werden; sie sind in der personalisierten Manifest-Adresse enthalten.

## Deployment über Cloudflare Workers

1. Dieses öffentliche Repository in Cloudflare unter **Workers & Pages → Create application → GitHub** auswählen.
2. Als Worker-Name **`nuvio-de-fussball`** verwenden (entspricht `wrangler.jsonc`).
3. Deploy-Befehl **`npx wrangler deploy`**; kein Build-Befehl nötig. Nach dem Verknüpfen werden Änderungen an GitHub automatisch ausgerollt.
4. Den erhaltenen HTTPS-Endpunkt öffnen, z.B. `https://nuvio-de-fussball.DEINE-SUBDOMAIN.workers.dev/configure`.
5. Optional die **persönliche Manifest-URL von Nuvio Live Sports** und/oder die **für Live TV konfigurierte PenguPlay-Manifest-URL** einfügen. Sports Streams und das öffentliche PenguPlay-Manifest werden bereits automatisch abgefragt. Auf **Installations-URL erstellen** klicken.
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
- `/poster/bl1/<MatchID>.svg` – Poster-SVG mit Vereinslogos, soweit verfügbar
- `/health` – Status

**Datenschutz / Disclaimer:** Kein offizielles Angebot von Nuvio, Stremio, DFB oder OpenLigaDB. Die Quelldienste und deren Zugriffsberechtigungen bleiben unabhängig. Dieses Projekt bietet keine unautorisierten Streamquellen und versucht nicht, Geoblocking, DRM oder CAPTCHA zu umgehen.
## GitHub Actions / Prüfung

Bei jedem Push auf `main` prüft der Workflow [Worker checks](.github/workflows/ci.yml) die Node-Tests (`npm test`) und erstellt einen Cloudflare-Worker-Testbuild (`npx wrangler deploy --dry-run --outdir dist`). Das **deployt nicht selbst** – für eine öffentliche Nuvio-Manifest-URL muss der Worker einmal über die Cloudflare-GitHub-Integration mit diesem Repository verbunden werden. Das gelingt unter **Workers & Pages → Create → Import a repository**, Produktionsbranch `main`, Deploy-Befehl `npx wrangler deploy`. Den Worker-Endpunkt danach über `/health` und `/manifest.json` kontrollieren.

## Datenquellen und wichtige Grenzen (v0.3.0)

- **OpenLigaDB (ODbL 1.0):** deutsche Wettbewerbe inklusive Champions League (`ucl`); Teams liefern häufig `teamIconUrl`.
- **ESPN Site API:** Europa League und Conference League, jeweils die kommenden ~30 Tage. Öffentliche, nicht offiziell garantierte API mit Mannschaftsnamen und Logo-URLs; bei Fehlern kann ein Katalog vorübergehend leer bleiben.
- **Sports Streams:** öffentliche Manifest-URL `https://sports.highfly.dev/manifest.json` – nur reguläre Add-on-Protokollendpunkte, keine eigenen Provider-Scraper.
- **PenguPlay:** öffentliche URL `https://pengu.uk/manifest.json`. Diese Standard-Konfiguration stellt möglicherweise **nur Film-/Serien-Streams ohne Fußballkataloge** bereit. Um Pengu-Live-TV-Veranstaltungen übernehmen zu können, muss eine persönliche Manifest-URL in `/configure` hinzugefügt werden, die tatsächlich Sport-Kataloge bereitstellt.
- **Nuvio Live Sports:** die URL hängt vom konkreten Anbieter/Hosting und gegebenenfalls der Personalisierung ab. Persönliche `https://.../manifest.json` unter `/configure` angeben. **Keinen ungeprüften öffentlichen Hostnamen hart einkodieren.**
- Streamquellen werden bei Bedarf (wenn ein Spiel geöffnet wird) abgefragt, nicht dauerhaft in diesem Repository gespeichert. Zugangsdaten werden nicht im Repository abgelegt. Direkte Verlinkungen ersetzen keine Nutzungsrechte; bei nicht unterstützten P2P-/geschützten Formaten wird nichts umgangen.
- Logos und Namen der Mannschaften gehören den jeweiligen Rechteinhabern; die Grafiken sind keine offiziellen Wettbewerbsmedien.
