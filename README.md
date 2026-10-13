# Couple Wear – Personalisierung mit Printful

Der Shop besitzt einen zweistufigen Personalisierungsablauf:

1. Auf `/pages/personalisieren` geben Kund:innen ausschließlich Namen und Datum ein.
2. Danach öffnet sich das ausgewählte Produkt. Größe/Farbe werden über Shopify gewählt; Namen und Datum sind bereits eingesetzt und werden als Line-Item-Properties mit der Bestellung gespeichert.

Für den ersten produktiven Stand wird Printfuls offizielle textbasierte Personalisierung verwendet. Personalisierte Shopify-Bestellungen erscheinen bei Printful als Entwurf mit **Requires personalization**. Dort werden Namen und Datum kontrolliert, in die Textfelder des Designs übernommen und erst anschließend zur Produktion freigegeben.

## Einmalige Shopify-Einrichtung

### 1. Personalisierungsseite erstellen

1. Shopify-Admin öffnen.
2. **Onlineshop → Seiten → Seite hinzufügen**.
3. Titel: `Personalisieren`.
4. URL-Handle: `personalisieren`.
5. Als Theme-Vorlage `page.personalisieren` auswählen.
6. Speichern und die Seite veröffentlichen.

Das ist der einzige Schritt, den ein Theme nicht selbst erledigen darf: JSON-Templates stellen eine Vorlage bereit, erstellen aber keine Shopify-Seitenressource.

### 2. Zielprodukt auswählen

1. **Onlineshop → Themes → Anpassen** öffnen.
2. Oben die Seite **Personalisieren** auswählen.
3. Im Abschnitt **Couple Wear · Start** unter **Printful-Produkt für den nächsten Schritt** das personalisierte Produkt wählen.
4. Optional das Linienkunst-Motiv austauschen.
5. Auf der Startseite im Abschnitt **Couple Wear · Hero** die Seite **Personalisieren** auswählen.

Ohne explizite Auswahl verwendet die Personalisierungsseite als Fallback das erste veröffentlichte Produkt im Shop.

## Einmalige Printful-Einrichtung

1. Die offizielle Printful-App in Shopify installieren und den Store verbinden.
2. In Printful den **Design Maker** öffnen und ein Produkt mit dem gewünschten festen Motiv anlegen.
3. Für die veränderbaren Textbereiche Text-Layer für Namen und Datum anlegen.
4. Für das Produkt die Printful-Funktion **Personalization** aktivieren.
5. Das Produkt aus Printful nach Shopify veröffentlichen oder das bestehende Shopify-Produkt in Printful vollständig synchronisieren.
6. Prüfen, dass alle Größen-/Farbvarianten synchronisiert sind und der Printful-Standort die Erfüllung verwaltet.
7. In Printful unter **Settings → Store settings → Orders** die manuelle Bestätigung aktivieren. Personalisierte Produkte werden ohnehin als Entwurf importiert; die Einstellung schützt zusätzlich vor versehentlicher Produktion.
8. Dieses Produkt anschließend in der Shopify-Personalisierungsseite auswählen.

## Ablauf bei jeder Bestellung

1. Shopify-Zahlung prüfen.
2. In der Shopify-Bestellung die Eigenschaften `Namen`, `Datum` und `Personalisierung` kontrollieren.
3. Printful öffnen. Der Auftrag sollte den Status **Requires personalization** haben.
4. **Personalize order** öffnen und Namen/Datum exakt aus Shopify übernehmen.
5. Mockup, Schreibweise, Druckposition und Produktvariante prüfen.
6. Auftrag erst danach bestätigen und an Printful übergeben.

Für den aktuellen Text-MVP ist keine eigene Printful-API nötig. Eine Vollautomatisierung benötigt später einen separaten, geschützten Server mit Printful-Token; ein Token darf niemals in Liquid oder Browser-JavaScript stehen. Printfuls Orders API kann individuelle Druckdateien als Draft anlegen, doch für zwei Textfelder ist der offizielle `Requires personalization`-Workflow sicherer und schneller einsatzbereit.

## Relevante Dateien

| Datei | Aufgabe |
| --- | --- |
| `templates/page.personalisieren.json` | Vorlage der neuen Startseite |
| `sections/cw-personalize-page.liquid` | Eingabe von Namen und Datum |
| `assets/cw-personalize-page.js` | Übergabe der Eingaben zur Produktseite |
| `snippets/cw-customizer.liquid` | Produktvorschau und Shopify-Line-Item-Properties |
| `assets/cw-customizer.js` | Vorbelegung, Live-Vorschau und Validierung |
| `sections/cw-hero.liquid` | Verlinkung des Startseitenbuttons |

## Tests

```bash
node --test tests/cw-studio-contract.test.mjs
node --check assets/cw-personalize-page.js
node --check assets/cw-customizer.js
```

Vor dem Livegang eine Testbestellung mit 100-%-Rabatt durchführen und prüfen, ob sie in Printful als personalisierbarer Entwurf erscheint. Nicht bestätigen, solange kein Testprodukt beziehungsweise keine Testzahlung vorgesehen ist.

