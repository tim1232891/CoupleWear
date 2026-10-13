# Printful-Draft-Workflow

## Store-ID

Bei einem Printful-Token mit Zugriff auf **einen einzelnen Store** bleibt
`PRINTFUL_STORE_ID` leer. Bei einem Account-Token wird die numerische Store-ID
benötigt und als `X-PF-Store-Id` gesendet. Die ID kann im Printful-Dashboard oder
über den Stores-Endpunkt der API ermittelt werden.

## Benötigte Token-Rechte

- Bestellungen anzeigen und verwalten
- Store-Produkte anzeigen
- Store-Dateien anzeigen und verwalten

Der Token bleibt ausschließlich in `.env` beziehungsweise im Secret-Store des
Hosters. Mit `node scripts/check-printful-token.mjs` wird nur Gültigkeit und Scope
geprüft; das Skript erstellt keine Bestellung.

## Varianten-Mapping

Die Shopify-Varianten müssen auf echte Printful-Katalogvarianten abgebildet werden.
Keine IDs raten. Beispielstruktur:

```dotenv
PRINTFUL_VARIANT_MAP_JSON={"SHOPIFY_VARIANT_ID":{"catalogVariantId":PRINTFUL_CATALOG_VARIANT_ID,"placement":"front","technique":"dtg"}}
```

Für jede Farbe und Größe ist ein eigener Eintrag nötig. Die API blockiert den
Draft, wenn ein Mapping fehlt.

## Ein einziger Bestellweg

Vor Aktivierung des API-Wegs muss entschieden werden:

- **Manueller Printful-Shopify-Weg:** `PRINTFUL_ORDER_MODE=manual`; die bestehende
  Printful-App importiert die Bestellung, Personalisierung wird manuell ergänzt.
- **Couple-Wear-API-Weg:** automatischen Printful-Bestellimport deaktivieren;
  `PRINTFUL_ORDER_MODE=api-draft`; die API erstellt genau einen v2-Entwurf.

Beide Wege gleichzeitig würden doppelte Fulfillment-Aufträge riskieren.

Der implementierte API-Aufruf ist `POST /v2/orders` ohne Confirmation-Endpunkt.
Laut Printful ist der Status `draft` nicht kostenpflichtig und geht erst nach einer
separaten Bestätigung in Produktion. Diese Bestätigung ist nicht implementiert.

Quelle: https://developers.printful.com/docs/v2-preview/
