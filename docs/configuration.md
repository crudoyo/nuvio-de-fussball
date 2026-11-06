# Persönliche Konfiguration und App-Installation

Stand: 06.11.2026, Version 0.5.0.

Die Konfiguration wird vom bestehenden Worker unter `/configure` ausgeliefert. Es braucht weder einen zweiten Host noch ein Konto oder eine Datenbank. Die Seite funktioniert auf Desktop und Handy und lädt keine externen Skripte, Schriften oder Analysedienste.

## Benutzung

1. Wettbewerbe oder einzelne Kataloge auswählen. Für 1. Bundesliga und 3. Liga können die Wochen- und Tagesreihen getrennt gewählt werden. Die Suche hilft beim Finden; zum Sortieren die Suche leeren und die Pfeile an den ausgewählten Reihen verwenden.
2. Optional Browser-Ersatzoptionen ausschalten und bis zu acht zusätzliche HTTPS-Manifest-URLs eintragen, eine pro Zeile. DaddyLive und die eingebauten öffentlichen Anbieter bleiben automatisch angebunden. Ein zusätzlicher Anbieter wird erst beim Öffnen eines Spiels abgefragt.
3. **Installationslinks erstellen** wählen. **In Nuvio installieren**, **In Stremio installieren** und die kopierbare HTTPS-URL übernehmen exakt dieselben Einstellungen.
4. Falls das Betriebssystem oder die App nachfragt, die Installation dort bestätigen. Falls ein Browser keine App-Links öffnet, die HTTPS-URL in der App unter Add-ons importieren.
5. **Auswahl bearbeiten** öffnet den persönlichen Konfigurationslink. Änderungen erzeugen eine neue URL; eine vorhandene Installation ändert sich dadurch nicht automatisch. Den neuen Link installieren bzw. die bisherige Installation ersetzen.

Die gewünschte Reihenfolge steht im Add-on-Manifest. Eigene Sortier- und Sichtbarkeitseinstellungen des Clients können die Darstellung zusätzlich beeinflussen. Die Browseroption blendet externe Player aus; sie macht einen nicht unterstützten Player nicht zu einem Direktstream.

## Kompatibilität

`/u/<base64url>/manifest.json` enthält JSON mit folgenden Feldern:

- `m`: zusätzliche Manifest-URLs; bisheriges Format bleibt gültig.
- `c`: optionale Liste stabiler Katalog-IDs in der gewählten Reihenfolge. Fehlt sie, gelten alle Standardkataloge inklusive später ergänzter Wettbewerbe.
- `b`: optionale boolesche Auswahl für Browser-Ersatzoptionen. `false` entfernt Browseroptionen, ohne native Streams anderer Installationen zu beeinflussen. Betreiberbeschränkungen bleiben wirksam.

Ausgeblendete Kataloge liefern keine Einträge. Gespeicherte Spiel-IDs und die Meta-/Stream-Endpunkte bleiben erreichbar. Vorübergehend fehlende gespeicherte Kataloge werden beim Bearbeiten erhalten und gekennzeichnet.

Die Seite überträgt das Formular per POST und erzeugt die Links ohne Speicherung. Persönliche URLs sind **nicht verschlüsselt**: Zusätzliche Anbieter können Zugriffstoken in ihren URLs verwenden. Den persönlichen Link deshalb privat halten. Die Seite setzt `no-store` und `Referrer-Policy: no-referrer` und gibt keine persönlichen URLs an Drittanbieter-Webseiten weiter.

## Bestätigte App-Link-Formate

Aus `https://HOST/u/KONFIGURATION/manifest.json` entstehen:

- `nuvio://HOST/u/KONFIGURATION/manifest.json`
- `stremio://HOST/u/KONFIGURATION/manifest.json`

Nuvio Mobile 0.6.8-beta erkennt Add-on-Adressen mit dem `nuvio`-Schema und setzt sie wieder auf HTTPS um. Nachgeprüft im offiziellen [AppUrlBridge.kt dieser Version](https://github.com/NuvioMedia/NuvioMobile/blob/0.6.8-beta/composeApp/src/commonMain/kotlin/com/nuvio/app/core/deeplink/AppUrlBridge.kt). Stremio dokumentiert das eigene Schema in der [offiziellen SDK-Anleitung](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/advanced.md).

Automatische Tests und die Browserprüfung kontrollieren Auswahl, Reihenfolge, Wiederherstellung, Import-URL, App-Links und mobile Darstellung. Sie ersetzen keinen Installations-/Wiedergabetest auf einem echten iPhone oder TV. Die Seite öffnet Apps nur nach einem bewussten Klick und erzwingt keine Installation.
