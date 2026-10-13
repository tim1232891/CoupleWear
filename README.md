# Couple Wear AI Studio

Ein Shopify-Theme-Modul für personalisierte Couple-Wear. Kund:innen laden ein gemeinsames Foto hoch, wählen einen Linienkunst-Stil, ergänzen Namen und Jahr und sehen die Kombination direkt auf dem T-Shirt- oder Hoodie-Mockup.

## Was bereits funktioniert

- Vier geführte Schritte: Foto, Linienkunst, Personalisierung, Bestellung
- Bildvalidierung für JPG, PNG und WebP bis 10 MB
- Lokaler Linienkunst-Entwurf im Browser mit drei Stilen: Fine Line, Romantic und Detailed
- Live-Mockup mit Namen, Jahr, Schrift und optionalem Herzrahmen
- Übergabe aller Gestaltungsdaten als Shopify-Line-Item-Properties
- Private Metadaten für Referenzfoto, Design-ID, Produktionsstatus und Printdatei
- Warenkorb wird blockiert, bis Foto, Entwurf und Namen vollständig sind
- Voll responsive und per Tastatur bedienbar

Die lokale Bildverarbeitung ist absichtlich nur ein Entwurf. Sie hält das Foto im Browser, liefert aber keine geprüfte Druckdatei. Für den echten Produktionsbetrieb übernimmt der unten beschriebene Studio-App-Proxy die KI-Verarbeitung, sichere Ablage und die Freigabe an Printful.

## Theme-Dateien

| Datei | Aufgabe |
| --- | --- |
| `snippets/cw-customizer.liquid` | Studio-Oberfläche und Shopify-Properties innerhalb des Original-Produktformulars |
| `assets/cw-customizer.js` | Upload, Linienkunst-Entwurf, Live-Mockup, Validierung und App-Proxy-Aufruf |
| `assets/cw-customizer.css` | Responsive Studio-Oberfläche |
| `blocks/buy-buttons.liquid` | Theme-Editor-Einstellungen inklusive optionalem App-Proxy |

## Aktivierung im Theme

1. Öffne in Shopify **Onlineshop → Themes → Anpassen**.
2. Öffne ein personalisierbares Produkt und den Block **Kaufbuttons**.
3. Aktiviere **Live-Personalisierung aktivieren**.
4. Optional: Lade ein neutrales Mockup und ein Standardmotiv hoch. Das Mockup darf keinen bestehenden Aufdruck tragen.
5. Solange der App-Proxy noch nicht verbunden ist, bleibt **Studio-App-Proxy** leer. Dann erzeugt das Studio ausschließlich einen lokalen Entwurf.

Die Produktvorlage `product.json` ist dafür bereits aktiviert. `product.standard.json` bleibt als nicht-personalisierbare Vorlage vorbereitet.

## Produktionsarchitektur

```text
Kund:innenfoto
      │
      ├─ ohne App-Proxy → lokaler Entwurf + private Bestellanhänge
      │
      └─ mit App-Proxy → Couple Wear Studio Service
                              │
                 sichere Objektablage + Design-ID
                              │
                     KI-Linienkunst / Druckdatei
                              │
                    menschliche Qualitätsprüfung
                              │
                    Printful-Draft → Freigabe
```

Für Printful wird zuerst ein **Draft** angelegt, nicht automatisch bestätigt. Nach der Prüfung sendet der Service das bestätigte Motiv an Printful. Printful kann Druckdateien über eine geschützte URL referenzieren und einen Auftrag anschließend bestätigen. Die Datei-URL muss dabei für Printful erreichbar sein; eine Vorschau-URL allein reicht nicht.

## Vertrag für den Studio-App-Proxy

Lege im Theme-Editor im Feld **Studio-App-Proxy** beispielsweise diese relative Route an:

```text
/apps/couple-wear-studio/design
```

Der Service muss einen `POST` mit `multipart/form-data` annehmen. Felder:

```text
photo     Bilddatei (JPG, PNG oder WebP)
style     Fine Line | Romantic | Detailed
names     optionaler Name zum Gestalten der finalen Datei
year      optionales Jahr
font      Signatur | Elegant | Modern
garment   T-Shirt | Hoodie
```

Antwort (JSON):

```json
{
  "designId": "cw_01JXYZ...",
  "previewUrl": "https://cdn.example.com/designs/cw_01JXYZ-preview.png",
  "printFileUrl": "https://cdn.example.com/designs/cw_01JXYZ-print.png",
  "printStatus": "Prüfung erforderlich"
}
```

Anforderungen an den Service:

- Die App-Proxy-Signatur und jeden Shopify-Webhook serverseitig validieren.
- Fotos nur verschlüsselt speichern; Zugriff auf die Druckdatei über kurzlebige, von Printful abrufbare URLs ermöglichen.
- Ein Design erst nach der Moderations-/Druckprüfung als `approved` markieren.
- Bei `orders/paid` die Design-ID aus den privaten Line-Item-Properties lesen und einen Printful-Draft erzeugen.
- Erst nach der Freigabe den Draft bestätigen. Kein `confirm=1` im automatischen Paid-Webhook.
- Produkt-/Varianten-Mapping serverseitig pflegen. Die Shopify-Variant-ID ist nicht automatisch eine Printful-Variant-ID.

## Empfohlener Bestellfluss

1. Der App-Proxy erzeugt das Design, speichert Original und Produktionsdatei und gibt `designId` zurück.
2. Das Theme übergibt `designId`, `printFileUrl`, Stil und Personalisierung als private Line-Item-Properties.
3. Der `orders/paid`-Webhook schreibt einen Produktionsjob mit Status `needs_review`.
4. Ein:e Mitarbeiter:in prüft Gesichtserkennung, Lesbarkeit, Druckfläche und Rechtehinweis.
5. Der Service legt mit der freigegebenen Druckdatei einen Printful-Draft an.
6. Nach erfolgreicher Preis-/Adressprüfung bestätigt der Service den Draft und speichert die Printful-Auftragsnummer an der Shopify-Bestellung.

## Datenschutz und Betrieb

Ein Paarfoto ist personenbezogen. Vor dem Go-live werden mindestens benötigt: Datenschutzerklärung mit Zweck und Löschfrist, Einwilligung für die KI-Verarbeitung, Auftragsverarbeitungsverträge für Speicherdienst/KI/Printful und eine Löschroutine für Originalfotos sowie Entwürfe. Die private Eigenschaftskonvention mit führendem Unterstrich verhindert die Anzeige im Storefront-Warenkorb, ersetzt aber keine Zugriffskontrolle oder Löschung.

## Tests

Ohne Abhängigkeiten:

```bash
node --test tests/cw-studio-contract.test.mjs
node --check assets/cw-customizer.js
```

Zusätzlich vor dem Go-live manuell prüfen:

1. T-Shirt und Hoodie auf Desktop und Mobilgerät.
2. Ungültige Bildtypen, 10-MB-Grenze und leeres Formular.
3. Alle drei Stile, lange Namen, leeres Jahr und alle Schriften.
4. Designänderung nach Stilwechsel: Bestellung darf nur den aktuellen Entwurf tragen.
5. Warenkorb/Bestellung: private Properties, Design-ID und Datei-URL sind im Admin sichtbar.
6. App-Proxy: ungültige Signatur, abgelaufene Datei-URL, KI-Fehler und Printful-Draft-Fehler.

