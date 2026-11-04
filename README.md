# Nuvio · Deutscher Fußball (Cloudflare Workers)

**Version 0.4.11 · Community-Prototyp**. Eigenständiges [Stremio-Addon](https://stremio.github.io/stremio-addon-sdk/protocol.html) für Nuvio TV. Deutsche Spielpläne und Champions League stammen von [OpenLigaDB](https://openligadb.de/) (ODbL); Europa League und Conference League werden über den öffentlich zugänglichen ESPN-Spielplan ergänzt.

## Funktionen

- Je Wettbewerb ein Katalog: Bundesliga, 2. Bundesliga, 3. Liga, DFB-Pokal, Frauen-Bundesliga, Frauen-Pokal, Supercup und automatisch erkannte deutsche Regional-, Ober- und Amateurligen.
- **Neu:** UEFA Champions League (OpenLigaDB, Kürzel `ucl`), Europa League und Conference League (ESPN-Soccer-Spielplan-Adapter, ohne API-Schlüssel).
- Jedes Spiel als eigene Kachel mit Anstoßzeit (Europe/Berlin), Gegnern und Status; 24 Stunden zurück und 30 Tage voraus. Die Poster enthalten, soweit verfügbar, beide **Vereinswappen** direkt in der SVG-Datei und kurze Mannschaftsnamen.
- Konfigurationsseite `/configure` für bis zu sechs **exakte HTTPS-Manifest-URLs** aus zusätzlichen Sport-Add-ons (insbesondere die persönliche Nuvio-Live-Sports- oder PenguPlay-Live-TV-URL).
- Der Worker prüft zusätzlich automatisch die bekannten öffentlichen Manifest-Schnittstellen von **Sports Streams** (`sports.highfly.to`) und **Nuvio Live Sports** (`nuvio.moaqeel6679.my.id`); die eigene PenguPlay-Live-TV-Konfiguration muss separat über `/configure` hinzugefügt werden. Zur Wiedergabe werden passende Spiele in `sport`- und `tv`-Katalogen ermittelt und direkte HTTP(S)-Streams der Anbieter übernommen, **nur bei eindeutigem Mannschaftsabgleich**. Direkter DaddyLive-Spielplanadapter und dokumentierte externe HTML-Playerlinks. Begrenzte automatische Auflösung normaler öffentlicher HLS-Quellen; keine Player-Entschlüsselung und keine P2P-/Torrent-Auflösung. Identische Stream-URLs werden zusammengefasst.
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
5. Optional die **persönliche Manifest-URL von Nuvio Live Sports** und/oder die **für Live TV konfigurierte PenguPlay-Manifest-URL** einfügen. Sports Streams und die öffentliche Nuvio-Live-Sports-Instanz werden bereits automatisch probeweise abgefragt. Auf **Installations-URL erstellen** klicken.
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

## Datenquellen und wichtige Grenzen (v0.3.2)

- **OpenLigaDB (ODbL 1.0):** deutsche Wettbewerbe inklusive Champions League (`ucl`); Teams liefern häufig `teamIconUrl`.
- **ESPN Site API:** Europa League und Conference League, jeweils die kommenden ~30 Tage. Öffentliche, nicht offiziell garantierte API mit Mannschaftsnamen und Logo-URLs; bei Fehlern kann ein Katalog vorübergehend leer bleiben.
- **Sports Streams:** öffentliche Manifest-URL `https://sports.highfly.to/manifest.json` – nur reguläre Add-on-Protokollendpunkte, keine eigenen Provider-Scraper.
- **PenguPlay:** Die öffentliche Standardadresse stellt keine persönliche Live-TV-Konfiguration zur Verfügung. Füge die individuell von PenguPlay erstellte HTTPS-Manifest-URL unter `/configure` ein. Die Auswahl von `Live TV` innerhalb von Nuvio wird nicht automatisch an einen unabhängigen Worker übermittelt.
- **Nuvio Live Sports:** Die bekannte öffentliche Instanz `https://nuvio.moaqeel6679.my.id/manifest.json` wird probeweise eingebunden, kann aber zeitweise ausfallen. Eigene personalisierte Manifest-URLs können unter `/configure` ergänzt werden.
- Streamquellen werden bei Bedarf (wenn ein Spiel geöffnet wird) abgefragt, nicht dauerhaft in diesem Repository gespeichert. Zugangsdaten werden nicht im Repository abgelegt. Direkte Verlinkungen ersetzen keine Nutzungsrechte; bei nicht unterstützten P2P-/geschützten Formaten wird nichts umgangen.
- Logos und Namen der Mannschaften gehören den jeweiligen Rechteinhabern; die Grafiken sind keine offiziellen Wettbewerbsmedien.

## Logo-Kompatibilität (v0.3.1)

- OpenLigaDB liefert Vereinslogos teils als originale Wikimedia-SVG-Dateien. Da die Match-Karten ausschließlich sichere eingebettete Rasterbilder verwenden, wird ein Wikimedia-SVG-Link auf die offizielle 240-Pixel-PNG-Vorschau des Wikimedia-Servers umgesetzt.
- Vorhandene große Wikimedia-SVG-Thumbnails werden auf 240 Pixel normalisiert; kurze Weiterleitungen auf demselben Host sind erlaubt. Andere Bildhosts und nicht unterstützte Formate bleiben beim Teamkürzel, statt eine fehlerhafte Grafik einzubetten.
- Die Poster-URLs enthalten eine Versionsangabe, damit Nuvio nach einem Update neue Grafiken lädt. Eine Bildquelle ohne gültige oder erreichbare Grafik lässt sich dadurch allein nicht reparieren.

## Diagnose und Logo-Fallback (v0.3.2)

- **Achtung: Sports Streams ist umgezogen.** Die frühere Hostadresse `sports.highfly.dev` wurde durch `sports.highfly.to` ersetzt. Bei Bedarf das eigene Sport-Add-on neu installieren.
- Unter `/debug/sources.json` zeigt der Worker pro automatisch angebundenem Anbieter, ob das Manifest erreichbar ist, wie viele Sportkataloge es anbietet und ob `stream` als Ressource deklariert wird. Die Diagnose zeigt **keine Stream-URLs oder persönlichen Zugangstoken** an.
- Im persönlichen Installationsdialog führt **Quellen prüfen** zur Diagnose desselben persönlichen Setups. Nicht ungeprüft persönliche Installations-URLs teilen.
- Die Mannschaftswappen werden zuerst aus OpenLigaDB geladen. Falls der Abruf nicht gelingt, versucht das Add-on für unterstützte Wettbewerbe die ESPN-Teamliste und deren Logos. Kann auch dieser Dienst kein Wappen liefern, erscheint weiterhin ein Kürzel. Die ESPN-Schnittstelle ist nicht offiziell unterstützt und kann aus Cloudflare gelegentlich fehlschlagen.
- Das Add-on hat weiterhin **keine direkten eingebauten DaddyLive-Scraper**. Streams werden nur dann angezeigt, wenn ein angebundener Anbieter eine passende Veranstaltung und eine nutzbare direkte HTTP(S)-Streamadresse anbietet. Vor Anpfiff sind Ergebnisse oft noch leer.
- Die Anzeige der Pengu-Kataloge in Nuvio ist unabhängig von der Nutzung des persönlichen PenguPlay-Manifests im Worker. Der Worker kann die Pengu-Einstellungen in Nuvio nicht auslesen.

## Sports Streams mirrors (v0.3.3)

The worker checks the official free instances `sports.highfly.to`, `sportsfree.highfly.to`, and `sportsfree-us2.highfly.to`, each via their standard Stremio manifest endpoint. The alternate domains were publicly announced by the Sports Streams developer. If the primary host blocks the Worker (HTTP 403), other instances can still return match and stream data. A mirror is not guaranteed to work: inspect `/debug/sources.json` for actual availability.

The public Nuvio Live Sports host may return HTTP 530; this cannot be fixed in the Worker. Users may specify their own working manifest URLs on `/configure` and install the newly generated personal football addon link. Personal manifest addresses may contain access tokens; do not post them publicly.

## Direkter DaddyLive-Spielplanadapter (v0.4.0)

Der Worker liest unabhängig von den blockierten Sport-Add-ons einen öffentlich dokumentierten DaddyLive-JSON-Spielplan von `https://dlstreams.st/schedule/schedule-generated.json`. Die Erreichbarkeit aus Cloudflare ist nicht garantiert.

- Unterstützt die Kategorien `Football` und `Soccer` sowie UK-GMT-Tagesüberschriften, `channels` und `channels2` mit eindeutigen Kanal-IDs.
- Mannschaftsabgleich und Anstoßzeit müssen übereinstimmen, bevor ein Kanal einem unserer Spiele zugeordnet wird.
- Für dokumentierte Kanal-IDs werden bei einem Treffer externe HTML-Playerseiten im Muster `https://thedaddy.pk/stream/stream-<id>.php` ausgegeben, **keine direkten HLS-/M3U8-Streams**. Die Nuvio-Wiedergabe ist nicht garantiert.
- Die Variable `DADDY_WEB_PLAYERS` steht in `wrangler.jsonc` auf `true`. Auf `false` ändern, um die externen Playerlinks abzuschalten.
- Optional kannst du einen autorisierten API-Schlüssel als Cloudflare-Secret `DADDY_API_KEY` speichern. Dann fragt der Worker zuerst die dokumentierte geschützte Schedule-API ab. Niemals einen API-Schlüssel in GitHub oder im persönlichen Manifest veröffentlichen.
- `/debug/sources.json` zeigt auch `DaddyLive (direkter Spielplan)` mit Erreichbarkeit, Zahl der Fußballveranstaltungen und Kanal-IDs sowie Fehlergründen, jedoch ohne Zugangsschlüssel.
- `/debug/daddy-match/defootball_bl1_<MatchID>.json` zeigt für eine konkrete Begegnung die zugeordneten Veranstaltungen und Sender ohne Playlist-Tokens.

**Grenze:** Der externe Player besteht aus HTML, nicht aus einer für Nuvio nativ abspielbaren Mediendatei. Die komplexe Entschlüsselung kurzlebiger, geschützter Video-URLs aus dem Referenzprojekt wird nicht übernommen. Nur mit entsprechenden Wiedergaberechten verwenden.

## Diagnostik nach Umzug von dlstreams.st (v0.4.1)

Die öffentlich verwendete frühere Spielplanadresse `dlstreams.st/schedule/schedule-generated.json` antwortet inzwischen mit HTTP 301. Externe Domainbeobachtung sieht eine Weiterleitung auf `thedaddy.pk`. Die offizielle dokumentierte Schedule-API unter `thedaddy.pk/daddyapi.php?endpoint=schedule` benötigt einen Schlüssel.

- Der direkte Adapter prüft zuerst `https://thedaddy.pk/schedule/schedule-generated.json`, danach die frühere `dlstreams.st`-Adresse.
- Weiterleitungen werden nur akzeptiert, wenn sie zu derselben JSON-Spielplanroute unter `dlstreams.st` oder `thedaddy.pk` führen. Umleitungen auf die Homepage, ungesicherte URLs oder andere Domains sind kein verwertbarer JSON-Spielplan und werden blockiert.
- Ein optionaler API-Schlüssel in `DADDY_API_KEY` wird bei Weiterleitungen **niemals weitergegeben**.
- `/debug/sources.json` unterscheidet jetzt `HTTP 301`, nicht verfügbare JSON-Endpunkte, Homepage-Weiterleitungen und HTML-/JSON-Fehler. Gibt keiner der öffentlichen Pfade einen Spielplan zurück, werden trotz laufendem Worker keine DaddyLive-Kanäle angezeigt.
- Ist der öffentliche Spielplan nicht mehr verfügbar, kann ein gültiger, vom Anbieter ausgegebener API-Schlüssel als Cloudflare-Worker-Secret hinterlegt werden. Die Verfügbarkeit wurde nicht live bestätigt.

Es werden weder geschützte Stream-Tokens entschlüsselt noch IP-, Login- oder DRM-Sperren umgangen.

## Spielbezogene DaddyLive-Diagnose (v0.4.2)

Der direkte Spielplan ist erreichbar, aber eine bestimmte Begegnung wird nicht immer gefunden. Vor allem mehrere Tage vor dem Anstoß kann die Partie noch im DaddyLive-Spielplan fehlen.

Unter `/debug/daddy-match/defootball_bl1_<MatchID>.json` werden jetzt zusätzlich **matchDiagnosis**-Daten ausgegeben:

- `fixture`: offizielle Mannschaftsnamen und Anstoßzeit (UTC) aus OpenLigaDB.
- `scheduleCoverage`: der tatsächlich von DaddyLive abgedeckte Zeitraum und die verfügbaren UTC-Tage.
- `eventsOnFixtureDate` und `sampleSameDayEvents`: wie viele DaddyLive-Fußballveranstaltungen am Spieltag geführt werden, sowie einige Veranstaltungstitel und Zeiten.
- `nearestEvents`: falls der Spieltag gar nicht abgedeckt ist, einige zeitlich benachbarte Veranstaltungen.
- `assessment`: `matched`, `fixture_date_not_in_schedule`, `fixture_not_matched_to_schedule` oder `no_football_events`.

Die Diagnose enthält keine API-Schlüssel, persönlichen Manifest-URLs oder Video-Token. Sie macht das Datum explizit sichtbar und vermeidet absichtliches Zuordnen unpassender Spiele. Vor Anpfiff kann eine spätere erneute Abfrage sinnvoll sein.

## Live-Spielplan-Fallback statt alter DaddyLive-JSON-Daten (v0.4.3)

Die auf `thedaddy.pk/schedule/schedule-generated.json` zurückgegebenen 40 Fußballveranstaltungen und 150 Sender stammten vollständig vom **20.03.2025** und waren kein aktueller Live-Spielplan. Eine erfolgreiche HTTP-200-Antwort allein ist daher keine hinreichende Erfolgskontrolle.

- Der Worker verwirft einen Spielplan, wenn dessen neueste Fußballveranstaltung mehr als **7 Tage zurückliegt** (`Stale schedule (YYYY-MM-DD)`).
- Bei veralteten, fehlenden oder nicht unterstützten JSON-Spielplänen versucht der DaddyLive-Adapter jetzt zusätzlich, die aktuelle öffentliche Homepage `https://thedaddy.pk/` als HTML abzurufen und dort `.schedule__day`, `.schedule__category` und `.schedule__event` auszulesen.
- Der HTML-Parser übernimmt Datum, Uhrzeit, Fußballkategorie, Veranstaltungstitel und öffentlich verlinkte numerische Kanal-IDs; andere Sportarten, HTML-Player-Skripte und Video-/Entschlüsselungstokens werden nicht extrahiert.
- Auch Datumskürzel wie `04th Nov 2026` werden unterstützt. Es handelt sich beim Quellformat um `UK GMT`; unklare Zeitangaben werden nicht erfunden.
- `/debug/sources.json` nennt bei Erfolg die neue Quelle `DaddyLive aktuelle Webseite`. Bei Misserfolg werden die Fehler der JSON-Quellen und des HTML-Fallbacks getrennt ausgewiesen. `/debug/daddy-match/...` zeigt weiterhin die konkrete Spielzuordnung.
- Der HTML-Aufbau der Webseite kann sich ändern und Zugriffe aus Cloudflare können blockiert sein. Diese Fälle werden ausdrücklich als nicht erreichbar gemeldet; ein erfolgreicher Live-Abruf oder nativer HLS-Stream ist noch **nicht** bestätigt.

Referenz für die DOM-Struktur: [DaddyLiveProvider.js im Open-Source-Projekt Nuvio Live Sports](https://github.com/rajhodedara/live-sport-plugin/blob/main/src/providers/DaddyLiveProvider.js).

## Direkter DaddyLive-Spieltest (v0.4.4)

- Der Diagnoselink `/debug/daddy-lookup.json?home=Borussia%20Dortmund&away=Real%20Betis&kickoff=2026-11-04T20%3A00%3A00Z` prüft unabhängig von der OpenLigaDB-Spiel-ID, ob die aktuell abrufbaren DaddyLive-Fußballveranstaltungen die konkrete Partie enthalten. Das Beispiel für den 4. November 2026 ist nach dem Spieltag nur noch ein historischer Testfall.
- Das JSON enthält den zugeordneten Veranstaltungstitel, Anstoßzeit, Sendernamen und -IDs sowie den Grund, falls die Paarung nicht erkannt wurde. Zugangstoken oder abspielbare Mediendateien sind darin nicht enthalten.
- Alte einzelne Ausreißer im ansonsten aktuellen DaddyLive-Spielplan (beispielsweise April 2026) werden verworfen, wenn sie älter als sieben Tage sind. Vollständig veraltete Spielpläne werden wie bisher abgelehnt und die nächstmögliche Datenquelle versucht.
- Ist die Veranstaltung über die direkte Diagnose auffindbar, aber nicht im Nuvio-Katalog, wird als Nächstes die OpenLigaDB-Katalog-ID beziehungsweise die Zuordnung der Mannschaftsnamen geprüft. Sind Sender sichtbar, ist damit **noch keine** erfolgreiche Videowiedergabe bestätigt.

## Native HLS-/DASH-Stream-Unterstützung (v0.4.5)

Die Android-APK `Sport TV Native` verarbeitet bei DaddyLive nicht bloß eine Medienadresse, sondern auch die Player-Auflösung, kurzlebige Playlist-Tokens und besondere komprimierte Mediensegmente in einem eigenen Media3-/ExoPlayer-Datenquellenadapter. Ein normales Nuvio-/Stremio-Add-on kann diesen Java-Adapter **nicht** auf dem Gerät ausführen. Die HTML-Player werden daher weiterhin ausdrücklich als `externalUrl` markiert, nicht als angebliche HLS-Streams.

**Was neu funktioniert:** Ein Kanal kann mit einer **eigenen, öffentlich abrufbaren, zur Wiedergabe freigegebenen** direkten `.m3u8`- oder `.mpd`-URL verknüpft werden. Der Stream erhält `url`, `behaviorHints.notWebReady: true` und bei Bedarf `behaviorHints.proxyHeaders.request` mit sicheren `Referer`-, `Origin`- und `User-Agent`-Feldern. Bereits über die optional eingebundenen Sport-Add-ons gelieferte direkte HLS-/DASH-URLs erhalten ebenfalls den WebReady-Hinweis, ohne ihre vorhandenen Header zu überschreiben.

Die Zuordnung erfolgt über die vom aktuellen DaddyLive-Spielplan erkannten numerischen Kanal-IDs. Setze in **Cloudflare Workers → Settings → Variables and Secrets** die optionale Text-/Secret-Variable `NATIVE_CHANNEL_STREAMS_JSON` auf eine JSON-Map wie:

```json
{
  "123": {
    "name": "Mein freier HLS-Livestream",
    "url": "https://cdn.example.org/live/playlist.m3u8",
    "headers": {
      "Referer": "https://portal.example.org/",
      "Origin": "https://portal.example.org",
      "User-Agent": "MyAuthorizedPlayer/1.0"
    }
  }
}
```

Dies ist nur ein **Formatbeispiel**, keine abspielbare URL. Ohne konfigurierte Quelle gibt es dadurch keine neuen nativen DaddyLive-Streams. Die Kanal-ID muss tatsächlich in einem zur konkreten Partie passenden DaddyLive-Spielplaneintrag vorkommen. Native Einträge erscheinen vor bisherigen `externalUrl`-Playern; sie werden nicht durch frei erfundene HLS-Adressen ersetzt.

**Sicherheitsgrenze:** Der Worker ist öffentlich erreichbar. Hinterlege **keine** Abonnement-URLs, Session-Cookies, DRM-Lizenzen, privaten Tokens, Signaturparameter oder Anmeldedaten in der Map. Credential-Parameter und lokale HTTP-Ziele werden zurückgewiesen; nur HTTPS-Medienadressen mit den Endungen `.m3u8` oder `.mpd` werden akzeptiert. Die Mapper-Funktion sendet keine API-Schlüssel an externe Anbieter.

**Warum bleibt ein Teil der DaddyLive-Quellen extern?** Ab 0.4.6 versucht `DADDY_NATIVE_RESOLVE=true` automatisch normale öffentliche HLS-Konfigurationen aufzulösen. Geprüft werden die benannten Playerframes und angebotene Alternativen desselben Kanals, das Manifest und das erste Videosegment. Native Ergebnisse erscheinen zuerst; externe Einträge heißen ausdrücklich „Browser“. Viewer-Tokens, Cookie-Sitzungen, verschlüsselte Playlists und gepackte Segmente werden dabei nicht umgangen oder verarbeitet. Diese Fälle bleiben Browser-Fallbacks. Die Android-App besitzt dafür einen eigenen Transport; eine vollständige native Wiedergabe dieser Quellen ist damit noch nicht umgesetzt.

`/debug/daddy-native/426.json` prüft einen einzelnen Kanal und liefert einen Status ohne Medienadressen oder Header. `/health` nennt Version und aktive Fähigkeiten. Stream-Listen erhalten `Cache-Control: no-store`. `scripts/smoke.mjs` prüft nach einem Push auf `main` die tatsächlich ausgelieferte Version und protokolliert die native Verfügbarkeit eines Beispielkanals. Eine erfolgreiche Manifest-/Segmentprobe bestätigt keine Bild-/Tonwiedergabe auf dem Gerät.

Die Installation in Nuvio benötigt die persönliche URL mit **`/manifest.json`**, nicht `/configure`. Zeigt ein bereits installiertes Addon noch 0.4.5, kann dessen Manifest im Client zwischengespeichert sein; die neue Version zuerst über `/health` und die Manifest-URL prüfen und das Addon bei Bedarf mit derselben Manifest-URL erneut hinzufügen. Persönliche `/u/...`-Adressen können Tokens enthalten und gehören nicht in öffentliche Fehlerberichte.

Offizielle Formatdefinition: [Stremio Stream Object](https://stremio.github.io/stremio-addon-sdk/api/responses/stream.html). Nuvio TV implementiert die Stream-Header im Player und überträgt sie auch bei HLS/DASH-Segmentanforderungen.
## Untersuchung nativer Wiedergabe

Die [technische Analyse und Grenzen](docs/native-playback.md) beschreibt die
Android-Wiedergabekette und NuvioTV-Schnittstelle. Optional aktiviert
`NATIVE_VERIFY_MANIFESTS="true"` eine begrenzte Inhaltsprüfung selbst
konfigurierter öffentlicher HLS-/DASH-Einstiegsmanifeste. Dies ist kein
automatischer DaddyLive-Resolver und kein Nachweis erfolgreicher Wiedergabe.

Version 0.4.7 hebt ausschließlich das begrenzte Playerseiten-Limit auf 4 MiB an (wie im Android-HTTP-Transport); Manifestlimit 256 KiB und Segmentprobe 4 KiB bleiben bestehen. Die Liveprobe von 0.4.6 hatte eine größere aktuelle Playerseite abgewiesen. Die Kanaldiagnose enthält nun zusätzlich Zähler, jedoch keine Medienadressen oder Zugangsdaten.

Version 0.4.8 ignoriert optionale Antwortcookies im automatischen Resolver, ohne sie zu speichern oder zu senden. Ein Cookie-Header allein gilt nicht mehr als Nachweis einer nötigen Sitzung; tatsächliches HTTP 401/403 beendet weiterhin den Abruf. Rein deklarierte Wrapper der Form `function f(x){return atob(x);}` werden als Datenformat erkannt, ohne Seitencode auszuführen.

Version 0.4.9 überspringt bekannte Spezialtransporte bereits vor dem Abruf. So bleibt das begrenzte Budget für bis zu acht Playerseiten mit gewöhnlichen Medienquellen verfügbar; Gesamtdeadline und Zugriffsprüfungen bleiben bestehen.

Ab 0.4.11 filtert der produktive Worker mit `NATIVE_ONLY=true` Browserlinks aus DaddyLive und verbundenen Add-ons. Wenn für ein Spiel keine direkte Medienquelle verfügbar ist, kann die Quellenliste leer bleiben.
