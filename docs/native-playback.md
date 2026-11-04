# Native DaddyLive-Wiedergabe: Untersuchung vom 04.11.2026

## Ergebnis und geprüfte Quellstände

Ein automatischer DaddyLive-Nativmodus ist mit dem untersuchten Stream-Vertrag
nicht allein durch Übergabe einer URL zuverlässig realisierbar. Normale öffentliche
HLS-/DASH-Quellen bleiben über die vorhandene Senderzuordnung nutzbar. Die neue
optionale Manifestprüfung verhindert dabei einige falsch deklarierte Quellen;
sie ist kein automatischer DaddyLive-Resolver und kein Nachweis einer Wiedergabe.

- Addon 0.4.5: `crudoyo/nuvio-de-fussball`, `77a6dfd75616ea577325236f8ad0a73604376beb`.
- Android: `crudoyo/streamingapps`, Branch `codex/daddylive-native`,
  `7910a03e45730642dc5dc9ce10866dfd26b969c2`.
- NuvioTV: `NuvioMedia/NuvioTV`, Branch `dev`,
  `99fbd65d8c16928d1fe11bf3f9812c4b5aaaca8f`.

Das installierte Nuvio-Produkt und dessen Version sind nicht bekannt. Die Aussagen
über Nuvio beziehen sich auf NuvioTV-Quellcode, nicht auf einen Gerätetest oder
automatisch auf Mobile/Desktop/iOS. Die vorhandenen Android-Anbieterhinweise
nennen noch 0.3.4; sie beweisen weder den Stand einer installierten 0.5.4-APK
noch deren vollständige Bild-/Tonwiedergabe.

Git-Transport war hier nicht erreichbar. Der Addon-Quellstand wurde über den
GitHub-Connector als unveränderter Dateisnapshot importiert. Der lokale erste
Commit ist ausdrücklich ein Snapshot, keine Kopie der gesamten Upstream-Historie.
Vorhandene Dateien im übergeordneten Arbeitsordner wurden nicht verändert.

## Android-Kette

Quellen im untersuchten Android-Commit:
[Resolver](https://github.com/crudoyo/streamingapps/blob/7910a03e45730642dc5dc9ce10866dfd26b969c2/native-tv/providers/daddylive/src/de/dario/streamingtv/DaddyResolver.java),
[Playlist](https://github.com/crudoyo/streamingapps/blob/7910a03e45730642dc5dc9ce10866dfd26b969c2/native-tv/providers/daddylive/src/de/dario/streamingtv/DaddyPlaylist.java),
[DataSource](https://github.com/crudoyo/streamingapps/blob/7910a03e45730642dc5dc9ce10866dfd26b969c2/native-tv/providers/daddylive/src/de/dario/streamingtv/DaddyHttpSource.java),
[Mediencontainer](https://github.com/crudoyo/streamingapps/blob/7910a03e45730642dc5dc9ce10866dfd26b969c2/native-tv/providers/daddylive/src/de/dario/streamingtv/DaddyMedia.java).

1. `DaddyMainActivity` lädt Programm und Sender; `DaddyCatalog` ermittelt die
   angebotenen Player. Die Auswahl ruft `DaddyResolver.resolve` auf.
2. Der Resolver folgt maximal vier Player-Ebenen, beschränkt Hosts und erkennt
   Schleifen. Er liest literale HTTPS-HLS-/DASH-Konfiguration oder begrenzte
   Base64-Datenfragmente. Er führt kein beliebiges Player-JavaScript aus.
   HTTPS-/Zertifikatsfehler und nicht lesbare Player führen zum Abbruch.
3. Ergebnis: Medien-URL, MIME-Typ, ursprüngliche Resolver-Seite, User-Agent,
   Referer und Origin. Referer ist hier der Ursprung des letzten Players plus
   `/`, nicht zwingend die ursprüngliche Senderseite.
4. `PlaybackExtras` übergibt diese Angaben an `PlayerActivity`. Der gemeinsame
   Build erzeugt `AppConfig.mediaNetwork` anhand der Anbieter-Konfiguration.
   Für DaddyLive wird der besondere Transport `DaddyHttpSource` eingesetzt.
   Media3 lädt das MediaItem über diese DataSource.
5. `NativeHttpSource` setzt Referer, Origin, User-Agent und `Accept-Encoding:
   identity`. `SiteHttp` hält Cookies ursprungsbezogen im Speicher. Redirects
   werden begrenzt und Cookies für jedes Ziel neu bestimmt. HTTP-Range sowie
   das Überspringen von Bytes bei ignoriertem Range werden behandelt.
6. `DaddyPlaylist` erkennt bestimmte `/premium.../*.m3u8`-Adressen mit den
   Player-Ursprüngen dembed/ksohls. Vor Playlist-Abrufen fragt es
   `/api/playlist-token?slug=...` an. Tokens werden nach Ursprung und Slug
   gespeichert (maximal 16 Einträge), mit begrenzter TTL von 20–1200 Sekunden
   nach der halben TTL erneuert. `t` und `_` werden ersetzt; bei Playlist-403
   erfolgt einmal eine erzwungene Token-Erneuerung. Das ist an laufende Abrufe
   gekoppelt und lässt sich nicht durch einmaliges Auflösen beim Stream-Listing
   ersetzen. Kommentare nennen die Tokens viewer-bound; eine konkrete
   IP-/Cookie-Bindung wurde hier nicht live untersucht.
7. `DaddyHttpSource` puffert bei ausgewählten Player-Ursprüngen Nicht-Playlist-
   Antworten vollständig (maximal 12 MiB). Range wird zunächst auf den ganzen
   Container ausgeweitet und erst nach dem Entpacken auf Medienbytes angewandt.
   `DaddyMedia` erkennt TS anhand von Syncbytes im Abstand 188, MP4 mit `ftyp`,
   WebP/EXIF mit TS, PNG mit angehängtem TS und PNG-Pixeln. Letztere benötigen
   Zlib, PNG-Filter 0–4 einschließlich Paeth, RGB/RGBA und den Marker TIKTIKPX
   samt längenbegrenztem Gzip. Hinzu kommen TIKTIKRAW und TIKTIKTSGZ.
   Ein normaler HLS-Demuxer kann diese Bildcontainer nicht als TS lesen.
8. Live startet am Livepunkt. Fehler zeigen eine erneute Quellenwahl bzw.
   Wiederauflösung an; es handelt sich nicht um eine Garantie nahtloser
   automatischer Wiederherstellung beliebig abgelaufener Medienadressen.

Die Android-Kette enthält keine hier nachgewiesene DRM-Entschlüsselung. Das
bedeutet nicht, dass jeder angebotene Sender ungeschützt oder freigegeben ist.

## Stremio und NuvioTV

Der [Stremio-Stream-Vertrag](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/stream.md)
unterscheidet `url` für Medien von `externalUrl` für Webseiten. Für
`behaviorHints.proxyHeaders` muss `notWebReady: true` gesetzt sein.
Dieses Flag fügt keine Medienverarbeitung hinzu.

Im [NuvioTV-Player](https://github.com/NuvioMedia/NuvioTV/blob/99fbd65d8c16928d1fe11bf3f9812c4b5aaaca8f/app/src/main/java/com/nuvio/tv/ui/screens/player/PlayerRuntimeControllerStreams.kt)
werden Request-Header aus `behaviorHints.proxyHeaders.request` übernommen.
[PlayerMediaSourceFactory](https://github.com/NuvioMedia/NuvioTV/blob/99fbd65d8c16928d1fe11bf3f9812c4b5aaaca8f/app/src/main/java/com/nuvio/tv/ui/screens/player/PlayerMediaSourceFactory.kt)
verwendet für HLS und DASH entsprechende Media3-Factories mit der gemeinsamen
HTTP-DataSource. Damit werden normale Playlist-Aktualisierungen und Unterabrufe
durch Media3 verarbeitet. [PlayerPlaybackNetworking](https://github.com/NuvioMedia/NuvioTV/blob/99fbd65d8c16928d1fe11bf3f9812c4b5aaaca8f/app/src/main/java/com/nuvio/tv/ui/screens/player/PlayerPlaybackNetworking.kt)
setzt die Header als Default-Request-Properties. Das ist eine Quellcodeaussage;
die tatsächliche Headerweitergabe auf dem Zielgerät wurde nicht gemessen.

| Bestandteil | Addon / bestehender NuvioTV-Player |
| --- | --- |
| Normales öffentliches HLS/DASH | URL und statische Request-Header übertragbar |
| Live-Playlist regelmäßig laden | Media3 übernimmt normale Manifestaktualisierung |
| Viewer-Token bei jedem Abruf erneuern | Kein entsprechender Addon-Callback |
| Ursprungsbezogene Resolver-Cookies | Kein übertragbares SiteHttp-Sitzungsobjekt |
| PNG/WebP in TS umwandeln | Keine DataSource-Klasse über Stream-JSON installierbar |
| PHP-/HTML-Player | Nur externalUrl; kein natives Video |
| DRM/Berechtigung | Nicht durch Header oder Containeranpassungen ersetzbar |

## Implementierter Umfang

`NATIVE_CHANNEL_STREAMS_JSON` bleibt unverändert kompatibel. Optional
`NATIVE_VERIFY_MANIFESTS="true"` in den Worker-Variablen setzen. Dann werden
die zugeordneten öffentlichen Quellen bei der Stream-Anfrage parallel mit
denselben erlaubten Referer-/Origin-/User-Agent-Hinweisen geprüft:

- Nur bereits konfigurierte, vom vorhandenen URL-Filter akzeptierte Adressen.
- Keine Redirectverfolgung, Cookiesitzung, Anmeldung oder Token-Erneuerung.
- HTTP 200, keine Set-Cookie-Antwort, maximal 256 KiB und 3,5 Sekunden Abort.
- HLS-Einstiegskennung plus STREAM-INF oder TARGETDURATION; DASH-MPD-Einstieg.
- Falsches Format, HTML, Netzwerkfehler oder Größenüberschreitung entfernen
  lediglich diese konfigurierte Quelle. Andere Addons und Browserlinks bleiben.

Die Prüfung ist bewusst optional: Cloudflare und das Wiedergabegerät haben
verschiedene IPs und Netzbedingungen. Eine vom Worker nicht erreichbare Quelle
kann vom Gerät erreichbar sein. Es gibt keinen Manifestcache und keine
Medienweiterleitung. DNS-Auflösung bleibt Aufgabe der Plattform; der vorhandene
Hostfilter ist kein vollständiger Schutz gegen vom Betreiber fehlkonfigurierte
DNS-Ziele. Die Konfiguration ist ausschließlich Betreiberkonfiguration.

Die Signaturprüfung ist eine Vorprüfung, kein vollständiger HLS-/XML-Parser.
Sie prüft keine Varianten, Segmente, Schlüssel, Codecs oder Wiedergaberechte.
Auch ein HTTP-200-Manifest kann später ablaufen oder unspielbare Segmente
liefern. Keinerlei Testdaten-URL ist als echter Sender konfiguriert.

## Geeignete nächste Wege

1. Anbieter stellt autorisierte stabile Standard-HLS-/DASH-Ausgabe bereit:
   vorhandene Senderzuordnung verwenden. Zugang und Weitergaberecht müssen
   unabhängig vom technischen Abruf geklärt sein. Öffentliche Lesbarkeit allein
   belegt keine Erlaubnis zur Weiterverbreitung.
2. Autorisierter clientseitiger NuvioTV-Transport: Token-/Session-Lebenszyklus
   und zulässige Containerverarbeitung direkt in Nuvio implementieren. Gleiche
   Geräte-IP und Sitzung vermeiden einen Teil der Worker-/Client-Differenzen.
   Das benötigt Änderungen am Player, nicht nur an diesem Addon.
3. Autorisierter privater Gateway: technisch könnte ein Worker oder eigener
   Server Manifeste und sämtliche relativen/absoluten Unter-URLs umschreiben,
   Tokens sitzungsbezogen erneuern und erlaubte Container in TS umwandeln.
   Das wäre ein vollständiger Medienproxy einschließlich Varianten, Audio,
   Untertiteln, Init-Segmenten, Byte-Ranges und gegebenenfalls Schlüsseln.
   Voraussetzungen sind belegte Anbieterfreigabe, abgesicherte Nutzerzugänge,
   Host-/Redirectregeln, Last-/Speichergrenzen und passende Hostingbedingungen.
   Ohne diese Grundlagen ist kein öffentliches Proxy-Endpunkt implementiert.
4. Bis dahin bleibt die vorhandene Android-App eine mögliche separate
   Wiedergabeoberfläche. Ein sicherer Deep-Link-Vertrag ist im untersuchten
   Addon nicht nachgewiesen; deshalb wird kein erfundener Intent ausgegeben.

Keine Zugriffskontrolle, DRM-Prüfung oder Berechtigungsabfrage wurde umgangen.
Eine automatische Freigabe aller DaddyLive-Quellen lässt sich aus den
vorliegenden Repositories nicht ableiten.

## Validierung

- `node --test`: 48 Tests bestanden, einschließlich vier neuer Preflight-Tests
  und erweiterter Integration mit abgelehntem sowie akzeptiertem Manifest.
- `node --check src/manifest-check.js` und `node --check src/worker.js`: bestanden.
- Kein Liveabruf von DaddyLive-Medien und kein Test am Nuvio-/Fire-TV-Gerät.
- Worker-Dry-Run nicht erfolgreich ausführbar: npm ist nicht installiert;
  die Wrangler-Installation über den vorhandenen pnpm scheitert am Zugriff auf
  `https://registry.npmjs.org/wrangler` (`ERR_PNPM_META_FETCH_FAIL`). Es gibt
  keinen lokal verfügbaren Wrangler. Ein erfolgreicher lokaler Worker-Build wird daher
  ausdrücklich nicht behauptet. In einer Umgebung mit Registry-Zugang:
  `npm install`, `npm test`, `npm run build`. Die bestehende GitHub-CI prüft
  bereits Tests und `wrangler deploy --dry-run --outdir dist`.

Nach Übertragung auf den GitHub-Branch `codex/daddylive-native` wurden alle 48
Tests und der Worker-Dry-Run mit Wrangler 4.157.0 in
[GitHub Actions erfolgreich ausgeführt](https://github.com/crudoyo/nuvio-de-fussball/actions/runs/41832368248).
Geprüfter Commit: `0e8967f2ce2278f4972362835b9158d5026a6f9c`.
Die GitHub-Commits bauen auf der bestehenden Upstream-Historie auf; der lokale
Snapshot-Commit wurde nicht in das Repository übertragen.

Der separate Check `Workers Builds: nuvio-de-fussball` der Cloudflare-
Hostingintegration meldet einen Fehler. Derselbe Check scheitert bereits am
unveränderten `main`-Commit `77a6dfd75616ea577325236f8ad0a73604376beb`.
Die über GitHub sichtbare Zusammenfassung enthält keine Fehlerursache; dafür
werden die Build-Logs im Cloudflare-Dashboard benötigt. Der erfolgreiche
Worker-Dry-Run ist deshalb kein Nachweis eines erfolgreichen Deployments.
