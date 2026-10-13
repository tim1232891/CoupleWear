# Couple Wear – Shopify-Personalisierung mit Printful

Der Shop besitzt eine eigenständige Personalisierungsseite unter
`/pages/personalisieren`. Kund:innen können dort:

1. einen mit Printful synchronisierten Pullover sehen,
2. Größe und Farbe auswählen,
3. Namen und optional ein Datum eingeben,
4. die Personalisierung direkt in der Vorschau sehen und
5. das fertige Produkt mit den Personalisierungsdaten in den Shopify-Warenkorb legen.

Die Werte werden als Shopify-Line-Item-Properties gespeichert:

- `Namen`
- `Datum`
- `Personalisierung`
- interner Status `_CW Produktionsstatus`

Dadurch stehen sie in der Shopify-Bestellung und im Printful-Personalisierungsauftrag
zur Verfügung.

## Einmalige Shopify-Einrichtung

### 1. Seite zuweisen

1. Shopify-Admin öffnen.
2. **Onlineshop → Seiten → Personalisieren** öffnen.
3. Sichtbarkeit auf **Sichtbar** stellen.
4. Rechts bei **Theme-Vorlage** die Vorlage **personalisieren** auswählen.
5. Speichern.

Wenn die Auswahl `personalisieren` nicht angezeigt wird, unter
**Onlineshop → Themes** prüfen, ob das veröffentlichte Theme mit
`tim1232891/CoupleWear`, Branch `main`, verbunden ist.

Als zusätzliche Absicherung erkennt das Theme den URL-Handle
`personalisieren` auch im Standardtemplate. Die Studio-Oberfläche wird deshalb
selbst dann angezeigt, wenn Shopify die Seite weiterhin als **Default page**
gespeichert hat.

### 2. Printful-Pullover auswählen

1. **Onlineshop → Themes → Anpassen** öffnen.
2. Oben im Seitenwähler **Seiten → Personalisieren** öffnen.
3. Links den Abschnitt **Couple Wear · Studio** auswählen.
4. Unter **Printful-Pullover** das Produkt auswählen, das aus Printful nach Shopify
   veröffentlicht wurde.
5. Optional Position und Größe der Live-Vorschau an das Produktbild anpassen.
6. Speichern.

Ohne diese Produktauswahl verwendet die Seite als Vorschau automatisch das erste
veröffentlichte Shopify-Produkt. Für den Live-Shop sollte das gewünschte
Printful-Produkt ausdrücklich ausgewählt werden.

## Einmalige Printful-Einrichtung

1. Die offizielle Printful-App in Shopify installieren und den Shop verbinden.
2. In Printful einen Pullover oder Hoodie mit dem festen Linienkunst-Motiv anlegen.
3. Namen und Datum im Printful Design Maker als personalisierbare Textbereiche
   einrichten.
4. **Personalization** für das Produkt aktivieren.
5. Das Produkt nach Shopify veröffentlichen.
6. Prüfen, dass alle Größen und Farben vollständig synchronisiert sind.
7. Dieses Shopify-Produkt anschließend wie oben beschrieben im
   **Couple Wear · Studio** auswählen.
8. In Printful die manuelle Auftragsbestätigung aktiviert lassen.

Bei einer Bestellung erscheinen Namen und Datum in den Produktangaben. Der Auftrag
wird in Printful als **Requires personalization** importiert. Dort werden die beiden
Texte eingesetzt, visuell geprüft und erst danach zur Produktion bestätigt.

## Warum kein Printful-API-Schlüssel im Theme steht

Shopify-Theme-Code wird an den Browser ausgeliefert. Ein dort gespeicherter
Printful-Token wäre für Besucher sichtbar und könnte missbraucht werden.

Für den jetzigen Ablauf ist die Printful-Shopify-Synchronisierung der sichere Weg.
Eine vollständige API-Automatisierung benötigt zusätzlich:

1. einen geschützten Server,
2. einen Shopify-`orders/paid`-Webhook mit HMAC-Prüfung,
3. einen serverseitig gespeicherten Printful-Token,
4. eine Zuordnung der Shopify-Varianten zu Printful-Katalogvarianten,
5. eine serverseitige Druckdatei pro Bestellung und
6. einen öffentlichen, nur für Printful abrufbaren URL dieser Druckdatei.

Die Printful API nimmt bei individuellen Designs eine fertige Druckdatei entgegen;
sie rendert Namen und Datum nicht automatisch aus den Shopify-Textfeldern. Deshalb
bleibt die Produktion zunächst bewusst im kontrollierten Printful-Entwurfsstatus.
API und normale automatische Shopify-Importe dürfen nicht gleichzeitig für denselben
Auftrag aktiv sein, sonst können doppelte Printful-Aufträge entstehen.

## Printful-API-Token lokal einrichten

Im Projekt liegen zwei Umgebungsdateien:

- `.env`: lokal und durch `.gitignore` von GitHub ausgeschlossen
- `.env.example`: sichere Vorlage ohne geheime Werte

### Privaten Token erzeugen

1. [Printful Developers](https://developers.printful.com/login) öffnen und mit dem
   eigenen Printful-Konto anmelden.
2. Links **Tokens** und anschließend **Create a token** beziehungsweise
   **Add new token** auswählen.
3. Als Namen beispielsweise `Couple Wear Backend` eintragen.
4. Bei **Access level** die Option **A single store** wählen.
5. Den mit Shopify verbundenen Couple-Wear-Store auswählen.
6. Für die geplante Bestellautomatisierung nur diese Berechtigungen aktivieren:
   - `orders` – Entwürfe erstellen und bearbeiten
   - `sync_products/read` – synchronisierte Produkte und Varianten lesen
   - `file_library` – individuelle Druckdateien verwalten
7. Ein Ablaufdatum wählen und den Token erstellen.
8. Den angezeigten Token sofort kopieren. Printful zeigt ihn nach dem Verlassen
   der Seite nicht noch einmal an.
9. Lokal in `.env` ausschließlich diese Zeile ergänzen:

   ```dotenv
   PRINTFUL_API_TOKEN=dein_token_von_printful
   ```

10. `PRINTFUL_API_ENABLED=false` unverändert lassen. Der Schalter wird erst
    aktiviert, wenn ein geschütztes Backend und der Shopify-Webhook eingerichtet
    und mit Testbestellungen geprüft wurden.

Ein Token für **A single store** benötigt normalerweise keine
`PRINTFUL_STORE_ID`. Bei einem Account-Token muss die Store-ID zusätzlich
eingetragen und bei API-Anfragen als `X-PF-Store-Id` gesendet werden.

### Token lokal testen

Nach dem Eintragen kann die Verbindung geprüft werden, ohne den Token auszugeben:

```sh
node scripts/check-printful-token.mjs
```

Das Skript zeigt nur an, ob der Token gültig ist und welche Berechtigungen er
besitzt. Es erstellt keine Bestellung und verändert keine Printful-Daten.

## Wichtige Dateien

| Datei | Aufgabe |
| --- | --- |
| `templates/page.personalisieren.json` | Vorlage der Personalisierungsseite |
| `sections/cw-personalize-page.liquid` | Produkt, Eingaben, Vorschau und Warenkorbformular |
| `snippets/cw-personalize-studio.liquid` | Wiederverwendbares Studio für Spezial- und Standardtemplate |
| `sections/main-page.liquid` | Automatischer Fallback für den Handle `personalisieren` |
| `assets/cw-personalize-page.js` | Live-Vorschau, Variante und Validierung |
| `assets/cw-personalize-page.css` | Responsives Studio-Design |
| `assets/cw-couple-hero-v2.webp` | Eigenes generiertes Kampagnenbild |
| `snippets/cw-customizer.liquid` | Personalisierung auf normalen Produktseiten |
| `sections/cw-hero.liquid` | Startseiten-Link zum Studio |

## Tests

```sh
node --test tests/cw-studio-contract.test.mjs
node --check assets/cw-personalize-page.js
node --check assets/cw-customizer.js
```

Vor dem Livegang eine Testbestellung mit einem 100-%-Rabattcode durchführen. In
Shopify müssen Namen und Datum an der Bestellposition sichtbar sein. In Printful
muss der Auftrag als personalisierungsbedürftiger Entwurf erscheinen. Den Auftrag
erst bestätigen, wenn Produkt, Variante, Schreibweise und Druckdatei geprüft wurden.

## Offizielle Dokumentation

- [Printful-Personalisierung für Shopify einrichten](https://help.printful.com/hc/en-us/articles/50264262794257-How-can-I-set-up-a-personalized-product-on-my-Shopify-store)
- [Ablauf personalisierter Shopify-Aufträge](https://help.printful.com/hc/en-us/articles/50264216563345-How-does-Printful-s-personalization-feature-for-Shopify-work)
- [Printful API](https://developers.printful.com/docs/)

## AI Studio 2.0

Die Personalisierungsseite enthält jetzt den vollständigen mobilen Ablauf aus
Foto-Upload, vier Fine-Line-Stilen, Vorschau/Neu-Generierung, separaten Textfeldern,
Schriftwahl, realen Shopify-Varianten und Live-Mockup. Ohne Backend-URL läuft sie
in einem klar gekennzeichneten Demo-Modus.

Die geschützte Node-API liegt unter `apps/studio-api`. Sie übernimmt OpenAI,
Upload-Bereinigung, signierte Dateien, 300-DPI-Druckdateien, Shopify-Webhooks und
optionale Printful-v2-Drafts. Alle produktiven Integrationen sind standardmäßig
deaktiviert.

Die Bildpipeline ist auf Wiedererkennbarkeit ausgelegt: hochauflösende
Eingabeaufbereitung, `gpt-image-2.5-sunburst` in hoher Qualität, ein strenger
Identitäts-Prompt sowie eine technische Linien- und Transparenzprüfung. Mit
Backend-URL, aber ohne `OPENAI_API_KEY`, wird das echte Foto lokal als
originalgetreue Sobel-Kontur verarbeitet. Nur ohne Backend-URL bleibt die
Shopify-Oberfläche im statischen Demo-Modus.

```sh
cd apps/studio-api
npm install
npm test
npm start
```

Weiterführende Dokumentation:

- [Architektur](docs/ARCHITECTURE.md)
- [Deployment und API-Key-Einrichtung](docs/DEPLOYMENT.md)
- [Datenschutz und Löschkonzept](docs/PRIVACY-AND-RETENTION.md)
- [Printful-Draft-Workflow](docs/PRINTFUL-SETUP.md)
- [Startkollektion als redaktioneller Entwurf](docs/STARTKOLLEKTION.md)
