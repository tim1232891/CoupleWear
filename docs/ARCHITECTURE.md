# Couple Wear AI Studio – Architektur

## Ergebnis der Repository-Analyse

Das Repository ist ein Shopify-Horizon-Theme (Liquid, JSON-Templates, CSS und
Browser-JavaScript). Vor diesem Ausbau gab es keine Shopify-App, keine Datenbank,
keine Server-API und keine serverseitige Dateiverarbeitung. Die vorhandene
Printful-Anbindung bestand aus einem synchronisierten Shopify-Produkt und
Line-Item-Properties für eine manuelle Personalisierung.

Der neue Aufbau trennt deshalb klar:

1. **Shopify-Theme:** Upload-Oberfläche, vier Stiloptionen, Live-Mockup, exakt
   gerenderte Texte, Shopify-Varianten und Warenkorb.
2. **Studio-API:** Geheimnisse, Bildprüfung, EXIF-freie Normalisierung,
   OpenAI-Bildbearbeitung, private Speicherung, signierte URLs und Druckdateien.
3. **Shopify-Webhooks:** HMAC-geprüfte Verarbeitung bezahlter Bestellungen sowie
   Datenschutz-Webhooks.
4. **Printful:** ausschließlich unbestätigte v2-Draft-Bestellungen. Es existiert
   absichtlich kein Codepfad zum Bestätigen oder Bezahlen.

## Datenfluss

```text
Browser -> Studio-API -> OpenAI Images API
   |           |
   |           +-> private Designablage -> signierte Vorschau
   |
   +-> Shopify-Warenkorb (Design-ID + exakte Textwerte)

Shopify orders/paid -> HMAC-Webhook -> 4500x5400 PNG / 300 DPI
                                    -> Printful v2 Draft (optional)
                                    -> manuelle Prüfung und Freigabe
```

Das Originalfoto wird nur im Arbeitsspeicher angenommen, mit Sharp rotiert,
auf bis zu 2560 Pixel detailerhaltend normalisiert und ohne Metadaten in PNG
umgewandelt. Die KI-Bearbeitung verwendet standardmäßig das präzise Editiermodell
`gpt-image-2.5-sunburst` mit hoher Qualität und 2048×2048 Pixeln. Der Prompt sperrt
Gesichtsform, Frisur, Proportionen, Pose und andere identitätsprägende Merkmale;
eine technische Nachprüfung verhindert zu leere oder flächig ungeeignete
Druckmotive. Das Original oder die
normalisierte Eingabe wird nicht dauerhaft gespeichert. Nur das erzeugte Design
und – nach Kauf – die Druckdatei werden in einem privaten Verzeichnis abgelegt.

Ohne OpenAI-Schlüssel erzeugt dasselbe Backend aus dem echten Upload lokal eine
Sobel-Konturzeichnung (`local-contour`). Sie bewahrt die tatsächlichen Kanten des
Fotos und benötigt keinen externen KI-Anbieter, ist gestalterisch aber weniger
selektiv als das Premium-Modell. Nur wenn im Theme überhaupt keine Backend-URL
eingetragen ist, zeigt die Browseroberfläche die statischen Mustermotive.

## Sicherheitsgrenzen

- `OPENAI_API_KEY`, `PRINTFUL_API_TOKEN` und `SHOPIFY_API_SECRET` gehören nur in
  die Serverumgebung. Sie dürfen nie in Liquid, JavaScript oder Theme-Einstellungen.
- Vorschau- und Druckdateien sind nur über zeitlich signierte URLs abrufbar.
- Uploads werden nach Größe, Dateisignatur, Pixelzahl und dekodierbarem Bildinhalt
  geprüft; EXIF-Daten werden nicht übernommen.
- Keine Fotos, Prompts oder Adressen werden in Anwendungslogs geschrieben.
- Rate-Limiting ist aktiviert. Für mehrere Serverinstanzen muss es vor dem
  Livegang durch einen gemeinsamen Redis-/Gateway-Limiter ersetzt werden.
- Die lokale Dateispeicherung ist für Entwicklung oder einen einzelnen Server mit
  verschlüsseltem Persistent Volume geeignet. Für horizontale Skalierung ist ein
  privater, verschlüsselter Objektspeicher mit kurzlebigen Signed URLs nötig.

## Noch vor dem Produktionsstart nötig

- HTTPS-Backend mit persistentem, verschlüsseltem Speicher bereitstellen.
- Dauerhafte Job-Queue für Webhook-Verarbeitung ergänzen, wenn mehrere Instanzen
  oder hohe Bestellmengen erwartet werden.
- Shopify-Custom-App erstellen und die vier Webhooks registrieren.
- Echte Shopify-Varianten mit echten Printful-Katalogvarianten abgleichen.
- Einen einzigen Fulfillment-Weg wählen; automatischen Printful-Import und
  API-Drafts nicht parallel verwenden.
- Datenschutz- und Rechtstexte durch eine qualifizierte Stelle prüfen lassen.
- Testbestellung durchführen und Druckbereich jedes realen Produkts gegen die
  Printful-Vorgaben prüfen. Die globale 4500×5400-Datei ist eine sichere
  Ausgangsfläche, ersetzt aber nicht die produktbezogene Druckbereichsprüfung.
