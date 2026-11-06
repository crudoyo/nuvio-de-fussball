# DaddyLive: Domainwechsel und Fallbacks

Stand: 06.11.2026. Der Nutzer möchte bestätigte alternative Daddy-Domains dauerhaft als Fallback berücksichtigen, sowohl in Sport TV als auch bei künftigen Arbeiten an Nuvio.

## Bestätigte Adressen

| Rolle | HTTPS-Origin | Prüfung am 06.11.2026 |
| --- | --- | --- |
| Aktuelle Hauptadresse | `https://thedaddy.li` | Programm, Senderseite und ausgewählte Player-Hüllseite HTTP 200 |
| Bisherige Hauptadresse | `https://thedaddy.pk` | Weiterleitung auf `.li`, Pfad und Sender-ID bleiben erhalten |
| Alternative | `https://dlhd.pk` | Weiterleitung auf `.li`, Pfad und Sender-ID bleiben erhalten |
| Alternative | `https://dlhd.st` | Weiterleitung auf `.li`, Pfad und Sender-ID bleiben erhalten |
| Bisherige Spielplanadresse | `https://dlstreams.st` | Weiterleitung auf `.li`, Pfad und Sender-ID bleiben erhalten |
| Bestätigtes Weiterleitungsziel | `https://dlive.sx` | Teil der Kette `dlstreams.st` → `dlive.sx` → `thedaddy.pk` → `thedaddy.li`; alle drei geprüften Pfade bleiben erhalten |

Je Domain wurden `/`, `/watch.php?id=31` und `/stream/stream-31.php` über HTTPS mit normaler Zertifikatsprüfung abgerufen. TNT Sports 1 bietet sieben Playerknöpfe. Keine Werbe-/Webseitenskripte ausgeführt, keine eingebetteten Fremdplayer oder Medien für diese Prüfung abgerufen. Das Verzeichnis `https://daddylive.pk/` nennt die drei Alternativen; es ist selbst kein austauschbarer Katalog-/Player-Origin. Weitere Domainnamen erst nach separater Prüfung aufnehmen.

Die Alternativen führen momentan alle zum selben Ziel. Sie helfen bei einem Ausfall einzelner Einstiegsadressen; sie sind kein unabhängiger Ersatz bei einem Totalausfall des Zielservers. Die Liste kann sich ändern und muss bei Störungen neu geprüft werden.

## Ursache in Sport TV und Bedeutung für Nuvio

Sport TV 0.5.4 verwendete `Catalog.siteLink("https://thedaddy.pk", ...)` für die Playerliste. Absolute Links unter `.li` wurden deshalb sämtlich verworfen. Die anschließende Resolver-Allowlist enthielt ebenfalls ausschließlich die alte Hauptdomain. Die Fehlermeldung „keine Player auswählbar“ war damit kein Nachweis fehlender Liveübertragungen.

Für das Nuvio-Addon sind insbesondere die Konstanten und die Redirectprüfung in `src/daddylive.js` zu beachten: Homepage, öffentliche Spielplanroute, API-Origin und erzeugte externe Playerlinks. Nur die Hauptkonstante zu ändern reicht bei einer separaten Host-Allowlist nicht. Frische HTML-Spielpläne und veraltete JSON-Spielpläne weiterhin getrennt prüfen; HTTP 200 allein bestätigt keinen aktuellen Spielplan.

Fallbacks müssen dieselbe Sender-ID und denselben ausgewählten Playerpfad erhalten. Erfolgreiche Adressen bevorzugen; Anzahl und Wartezeit der Versuche begrenzen; Abbruch sofort weitergeben. Bekannte Domain-Aliase akzeptieren, keine pauschale Freigabe von `thedaddy.*` oder unbekannten Redirectzielen. API-Schlüssel weiterhin nicht bei Redirects weiterreichen. TLS-Prüfung beibehalten. Gespeicherte Sender und Auswahl über stabile IDs bzw. Playerpfade zuordnen.

## Umsetzung in Nuvio 0.4.22

`src/daddy-domains.js` führt die explizite Liste gemeinsam für Spielplan, Player und Redirectprüfung. `www.thedaddy.pk` bleibt als bereits unterstützter Redirect-Host zugelassen. Das Spiegelverzeichnis gehört nicht zur Liste. Die aktuelle `.li`-HTML-Seite wird vor den öffentlichen JSON-Pfaden gelesen: Der alte JSON-Endpunkt lieferte bei der Prüfung zwar HTTP 200, aber Daten vom März 2025.

Netzfehler, Zeitüberschreitungen, HTTP 404/5xx und ungültige Spielpläne erlauben begrenzte Ausweichversuche. HTTP 401/403 und unzulässige Redirects beenden den jeweiligen Versuch ohne Domainwechsel. Erfolgreiche Origins werden im Worker-Prozess bevorzugt und für externe Playerlinks verwendet. Aliaswechsel und Redirects erhalten den kompletten Pfad und Query einschließlich Sender-ID; angebotene andere Playerpfade werden ausschließlich für denselben Sender übernommen.

Pro Spielplanabruf gelten höchstens 20 Requests und 7,5 Sekunden, pro Senderauflösung 20 Requests und 6 Sekunden; ein Aliasversuch dauert höchstens 1,5 Sekunden. Der Aufruferabbruch wird auch bei Fetchern weitergegeben, die das Abbruchsignal ignorieren. Schlüsselgebundene API-Aufrufe werden weder gespiegelt noch bei Redirects weitergereicht. HTTPS-Zertifikatsprüfung bleibt aktiv.

Automatisierte Tests prüfen Ausfälle, bevorzugte Aliase, die vollständige Redirectkette, Pfad-/Sendererhalt, unbekannte Ziele, API-Schlüssel, Zeit-/Requestlimits und Abbruch. Der lokale Abruf des echten `.li`-Spielplans am 06.11.2026 lieferte 117 frische Fußballereignisse und 242 eindeutige Sender-IDs (dynamischer Stand). Die Senderauflösung erreicht die Playerseiten wieder; Kanal 31 meldete `provider_transport_required` statt eines Domain-Redirectfehlers.

Eine erreichbare Player-HTML-Seite ist weiterhin kein natives HLS-/DASH-Manifest und kein Bild-/Tonnachweis. Die bisherigen Grenzen aus [native-playback.md](native-playback.md) gelten weiter. Ein erfolgreicher Gerätewiedergabetest wird damit nicht behauptet.

## Referenzen

- Aktuelle Website: <https://thedaddy.li/>
- Bisherige Website mit Redirect: <https://thedaddy.pk/>
- TNT-Senderseite: <https://thedaddy.li/watch.php?id=31>
- Spiegelverzeichnis: <https://daddylive.pk/>
- Separates Android-Projekt: <https://github.com/crudoyo/streamingapps>
