# Native DaddyLive-Wiedergabe: Untersuchung vom 04.11.2026

## Eigener HLS-Adapter in Version 0.4.23

`src/daddy-playback.js` ergänzt nun die eigene Wiedergabekette für den aktuell
geprüften `dembed.st/premiumtv/daddy.php?id=<Sender>`-Player. Sie liest dessen
explizite SRC-/EDGE-/CHANNEL-Konfiguration ohne Skriptausführung. Der eigene
`/daddy/live/<Sender>.m3u8`-Endpunkt ruft die öffentliche Playlist-Token-API wie
der Originalplayer auf, erneuert Tokens nach halber TTL und nach einmaligem
Playlist-403 und schreibt Varianten, Renditions und Medienadressen um. Für die
aus `_econfig` gelesene Assetrage-Konfiguration sind die dokumentierten
CDN-Adressen auf HTTPS-Port 8443 gesondert zugelassen.

`src/daddy-media.js` verarbeitet normale TS-/MP4-Daten sowie die geprüften
PNG-/WebP-Container. PNG-Pixel mit `TIKTIKPX` werden als begrenztes RGB/RGBA-Bild
mit Filtern 0–4 gelesen, der darin enthaltene Gzip-TS-Payload wird entpackt und
auf TS-Paketkennungen geprüft. PNG-IEND mit angehängtem TS, WebP-EXIF,
`TIKTIKRAW` und `TIKTIKTSGZ` sind ebenfalls unterstützt. HTTP-Ranges werden auf
die ausgegebenen Medienbytes angewandt. Verschlüsselte Playlists werden
weiterhin abgewiesen; es wird keine DRM-Verarbeitung ergänzt.

Player, Token-API und Medienziele haben getrennte feste Host-/Pfadregeln;
fremde Ziele, Zugangsdaten in URLs und unbekannte Ports werden verworfen.
Antworten und entpackte Medien sind größenbegrenzt. Eine einzelne
Wiedergabeanfrage hat höchstens 20 Netzabrufe und 20 Sekunden; das zusätzliche
Zeitbudget ist für Medienabrufe bestimmt. Die bestehende Senderauflösung
behält ihre sechs Sekunden und die Daddy-Domain-Fallback-Regeln. Medien-URLs
bleiben kurzlebige Wiedergabedaten; die Quellenzuordnung bleibt die Sender-ID.

Die heruntergeladenen Referenzen wurden vor Weiterarbeit nochmals geprüft:
`DaddyLiveProvider.js` ist identisch mit der unten referenzierten Repository-
Datei, die bereitgestellte `README.md` ist identisch mit `resolver/README.md`
des separaten Streamed.pk-Resolvers. Dessen WASM-/Protobuf-Handshake betrifft
Streamed.pk, nicht die hier geprüfte öffentliche Daddy-Playlist-Token-API.
Der Daddy-Provider selbst bevorzugt normale TS-Quellen und überspringt
bestimmte TikTok-Quellen. Die beim aktuellen Abruf tatsächlich angebotenen
Player für Magenta Sport 303 (11) und DAZN1 DE (426) liefern dagegen
PNG-Pixelcontainer. Beide gespeicherten Live-Segmente wurden lokal in gültige,
auf 188 Bytes ausgerichtete MPEG-TS-Pakete umgewandelt. Auch der vollständige
HLS-Endpunkt in der lokalen Cloudflare-Runtime lieferte für beide Sender HTTP
200 und TS. Vorübergehende Netzfehler, Timeouts und HTTP 5xx erlauben einen
erneuten Medienabruf innerhalb desselben Gesamtbudgets; HTTP 401/403 erlauben
keinen solchen Medien-Retry. Die oben beschriebene öffentliche Playlist-Token-
Erneuerung ist davon getrennt. Das ist kein Bild-/Tontest auf dem Nutzergerät.

`src/index.js` exportiert für Cloudflare ausschließlich den Worker-Handler.
Damit gelangen die benannten Node-Testhelfer aus `worker.js` nicht mehr in die
Runtime-Exporttabelle. Der zusätzliche CI-Schritt `check-worker-runtime.mjs`
startet die tatsächliche lokale Runtime, um solche Startfehler zu erkennen;
ein reiner Wrangler-Dry-Run führt den Worker nicht aus.

Die folgenden Abschnitte dokumentieren frühere Zustände. Aussagen über einen
fehlenden eigenen Playlistproxy oder fehlende Containerverarbeitung beschreiben
den Stand vor dieser Ergänzung.

## Korrektur der Quellenanbindung in Version 0.4.23 (06.11.2026)

Die bisher automatisch verwendete Nuvio-Live-Sports-Instanz
`nuvio.moaqeel6679.my.id` liefert HTTP 530. Der Entwickler nennt in seiner
[aktualisierten Ankündigung](https://www.reddit.com/r/nuvioaddons/comments/1wfexs3/update_the_nuvio_live_sports_public_instance_is/)
`https://nuviosports.xyz` als neue Adresse. Ihr Manifest war sowohl lokal als
auch über die Quellen-Diagnose des veröffentlichten Cloudflare-Workers
erreichbar. Die automatische Quelle verwendet jetzt diese Adresse.

Für FC Bayern München Frauen gegen SV Werder Bremen Frauen am 06.11.2026,
17:30 UTC (OpenLigaDB-Spiel 85776), liefert diese Instanz unter anderem native
DaddyLive-Optionen für Magenta Sport 303 und DAZN1 DE. Der lokale Liveabruf
des korrigierten Add-ons übernimmt beide Medienadressen sowie die vom Anbieter
gelieferten Header und `notWebReady: false` unverändert. Es werden weiterhin
die normalen Katalog-/Stream-Endpunkte verwendet, keine privaten Resolverrouten.
Die Medienaufbereitung übernimmt der ursprüngliche Anbieter.

Der Mannschaftsabgleich wertet gemeinsame Wörter wie `Frauen` und `Women`
nicht mehr als Vereinsnamen. Zuvor konnte der gemeinsame Zusatz auf beiden
Seiten genügen und Sender fremder Frauenbegegnungen beisteuern. Regressionstests
prüfen beide Vereinsidentitäten, die aktuelle Standardquelle und die unveränderte
Weitergabe der nativen Streamdaten.

Die Nutzerbilder zeigen native Wiedergabe im ursprünglichen Nuvio-Live-Sports-
Add-on. Das ist kein Gerätetest unseres korrigierten Add-ons. Ein erreichbares
Manifest und zurückgegebene Direktstreams belegen ebenfalls keine vollständige
Bild-/Tonwiedergabe auf dem Zielgerät. Der unten beschriebene begrenzte direkte
DaddyLive-Resolver erhält durch diese Änderung keinen neuen Spezialtransport.

## Referenzprüfung: Nuvio Live Sports (06.11.2026)

Der vom Nutzer genannte Quellcode
[`rajhodedara/live-sport-plugin`](https://github.com/rajhodedara/live-sport-plugin)
wurde am Commit `92589e4c0bef327d7cc483c3fbe2d40908ba8e17` geprüft. Dieser
serverseitige Wiedergabeweg ergänzt die ältere Android-Analyse unten: Für
vergleichbare Quellen muss nicht zwingend der Nuvio-Player geändert werden.

Die konkrete Kette in der Referenz:

1. [`DaddyLiveProvider.resolveStream`](https://github.com/rajhodedara/live-sport-plugin/blob/92589e4c0bef327d7cc483c3fbe2d40908ba8e17/src/providers/DaddyLiveProvider.js#L905)
   prüft alternative Playerpfade für dieselbe Sender-ID, lädt die eingebetteten
   Player und folgt begrenzten weiteren Player-Ebenen. Tote Embed-Hosts werden
   ausgelassen; eine Hostregistrierung priorisiert bekannte funktionierende Wege.
2. [`_resolveFromHtml`](https://github.com/rajhodedara/live-sport-plugin/blob/92589e4c0bef327d7cc483c3fbe2d40908ba8e17/src/providers/DaddyLiveProvider.js#L348)
   liest unter anderem die kodierte `_econfig`, normale HLS-Konfigurationen,
   JSON-Playerantworten und verschachtelte Frames. Dabei werden auch in JSON
   maskierte Querytrenner erhalten. Ein erfolgreich dekodierter Link ist erst
   die Eingabe für die weitere Medienbehandlung.
3. [`_buildManifestStream`](https://github.com/rajhodedara/live-sport-plugin/blob/92589e4c0bef327d7cc483c3fbe2d40908ba8e17/src/providers/DaddyLiveProvider.js#L538)
   gibt einen eigenen HLS-Endpunkt zurück. Er wird vor Veröffentlichung zu
   `/api/manifest.m3u8` umgeschrieben. Manifestabruf und Player-Unterabrufe
   müssen dasselbe Referer-/Origin-Paar verwenden; der Titel »Direct Stream«
   schließt einen serverseitigen Playlistproxy nicht aus.
4. Der [`Manifest-Endpunkt`](https://github.com/rajhodedara/live-sport-plugin/blob/92589e4c0bef327d7cc483c3fbe2d40908ba8e17/src/routes/manifest.js#L30)
   lädt und prüft Playlists, schreibt Folgeadressen um und hält Live-Playlists
   kurz im Cache. [`remint.js`](https://github.com/rajhodedara/live-sport-plugin/blob/92589e4c0bef327d7cc483c3fbe2d40908ba8e17/src/remint.js#L180)
   kann für die ursprüngliche Quelle eine frische Medienadresse ermitteln,
   wenn eine abgelaufene Adresse abgewiesen wird.
5. [`HlsRewriteService`](https://github.com/rajhodedara/live-sport-plugin/blob/92589e4c0bef327d7cc483c3fbe2d40908ba8e17/src/services/HlsRewriteService.js#L142)
   behandelt Varianten und Ressourcen in HLS-Tags. Normale Mediensegmente bleiben
   CDN-Abrufe. Für bestimmte mit Bildheadern versehene TS-Segmente existieren
   gesonderte Byte-Range-/Proxy-Wege. Der Code beweist nicht, dass jeder Sender
   diese Sonderbehandlung benötigt.

Die bereits gelesenen Original-Streamantworten für Magenta Sport 303 und DAZN1 DE
zeigen den eigenen `/api/manifest.m3u8`-Endpunkt. Die darin enthaltenen
CDN-Adressen verwenden HTTPS auf Port 8443, die Queryfelder `s` und `e` sowie
`https://assetrage.net/` als Referer. Querywerte und vollständige Medienadressen
werden hier nicht gespeichert. Damit ist für die gezeigten Optionen der
Playlistproxy nachgewiesen; deren konkrete Segmentformate wurden nicht geprüft.

Unser direkter Resolver unterstützt `_econfig` und diese Embed-Hosts noch nicht;
`publicResourceUrl` lehnt explizite Ports ab. Er besitzt außerdem weder eigene
Playlist-Ausgabe noch Quellen-Erneuerung oder Segmentanpassung. Der Status
`provider_transport_required` eines anderen Testkanals ist deshalb kein Beleg,
dass diese konkreten Sender eine Android-DataSource erfordern.

Die Korrektur in 0.4.23 übernimmt weiterhin fertige Ergebnisse des ursprünglichen
Add-ons. Eine eigenständige DaddyLive-Anbindung nach dieser Referenz ist damit
noch nicht implementiert oder auf dem Nutzergerät getestet. Die bestätigten
Daddy-Domain-Aliase, Sender-IDs, Requestlimits und Abbruchregeln bleiben für
eine spätere Anpassung maßgeblich; aus der Referenz entsteht keine pauschale
Freigabe unbekannter Hosts oder aller Ports.

## Ergänzung für Version 0.4.6

Die nachfolgende ursprüngliche Analyse beschreibt die Grenze des Android-
Spezialtransports. 0.4.6 ergänzt einen begrenzten automatischen Resolver für
gewöhnliches öffentliches HLS: benannte Playerframes und angebotene Alternativen
desselben Kanals, feste Player-Hostliste, maximal acht Playerseiten mit jeweils
höchstens zwei geprüften Redirects, drei Playlist-Ebenen, sechs Sekunden Gesamt-
zeit und begrenzte Antwortgrößen. Maximal zwei passende Sender werden pro
Stream-Anfrage geprüft. Es wird kein JavaScript ausgeführt; lediglich literale
Adressen und explizite `atob`-Datenfragmente werden gelesen.

Vor einem nativen Ergebnis muss ein HLS-Manifest und ein begrenzter Abruf des
ersten Segments eine gewöhnliche TS-/MP4-Kennung liefern. DASH bleibt über die
vorhandene manuelle Quellenkonfiguration unterstützt. Cookie-Sitzungen,
Playlist-Schlüssel, signierte Adressen und bekannte Spezialtransporte werden
im automatischen Resolver abgewiesen. Es gibt weder einen Medienproxy noch
Token-Erneuerung, Entpackung oder DRM-Verarbeitung.

`DADDY_NATIVE_RESOLVE=true` ist in der ausgelieferten Wrangler-Konfiguration
aktiviert. Native Ergebnisse werden vor Browserlinks angeboten. Ein fehlender
Direktstream bleibt als solcher erkennbar: Browser-Einträge erhalten einen
entsprechenden Namen; `/debug/daddy-native/<id>.json` nennt den Prüfstatus ohne
URLs, Header oder Tokens. Die neue Versionskennung wird in Paket, Manifest und
Health-Antwort konsistent getestet. Die Pipeline prüft die öffentliche Worker-
Adresse nach dem Deploy zusätzlich auf die erwartete Version. Der Live-Status
eines Kanals wird separat ausgegeben und nicht mit Gerätewiedergabe gleichgesetzt.

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
