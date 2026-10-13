# Einrichtung und Deployment

## 1. Lokaler Demo-Modus

```sh
cd apps/studio-api
npm install
npm start
```

`GET http://localhost:9292/health` muss `imageMode: "local-contour"` melden,
solange kein OpenAI-Schlüssel gesetzt ist. Dieser Modus wandelt das echte Foto
lokal in eine originalgetreue Schwarzlinien-Kontur um und überträgt es nicht an
einen externen KI-Dienst. Im Theme-Editor bleibt die Backend-URL für eine rein
statische Theme-Demo leer; dann verwendet die Oberfläche die vier lokalen Muster.

## 2. OpenAI-Projektschlüssel

1. Im OpenAI Platform Dashboard ein eigenes Projekt für Couple Wear anlegen.
2. Unter **API keys** einen neuen geheimen Projektschlüssel erstellen.
3. Den Schlüssel einmal kopieren und ausschließlich serverseitig eintragen:

   ```dotenv
   OPENAI_API_KEY=sk-...
   OPENAI_IMAGE_MODEL=gpt-image-2.5-sunburst
   OPENAI_IMAGE_QUALITY=high
   OPENAI_IMAGE_SIZE=2048x2048
   OPENAI_IMAGE_TIMEOUT_MS=300000
   OPENAI_API_BASE_URL=https://api.openai.com
   ```

4. Budget- und Nutzungslimits im Projekt setzen.
5. Den Schlüssel nie in Shopify, GitHub, Screenshots oder Browser-Code einfügen.

`gpt-image-2.5-sunburst` ist bewusst gewählt, weil bei diesem Shop präzise
Bildbearbeitung und Wiedererkennbarkeit wichtiger sind als die kürzeste Laufzeit.
`high` und `2048x2048` sind der produktive Qualitätsstandard. Wer nach Tests noch
mehr Detail braucht, kann `OPENAI_IMAGE_QUALITY=xhigh` oder `max` setzen; dadurch
steigen Laufzeit und Kosten. Das Ergebnis bleibt eine künstlerische Linienzeichnung
und ist keine biometrisch garantierte Reproduktion. Vor der Bestellung muss es in
der Vergleichsansicht geprüft werden.

Offizielle Einrichtung: https://platform.openai.com/api-keys

## 3. Backend bereitstellen

Das Backend benötigt Node.js 22 oder neuer, HTTPS und persistenten privaten
Speicher. Ein Container kann aus dem Repository-Root gebaut werden:

```sh
docker build -f apps/studio-api/Dockerfile -t couple-wear-studio-api .
```

In Produktion mindestens setzen:

```dotenv
PUBLIC_BASE_URL=https://studio-api.deine-domain.example
ALLOWED_ORIGINS=https://dein-shop.myshopify.com,https://deine-shop-domain.example
SIGNING_SECRET=<mindestens-32-zufällige-Bytes>
SHOPIFY_API_SECRET=<Secret-der-Custom-App>
DESIGN_RETENTION_HOURS=24
```

Das Volume `/data` muss privat, verschlüsselt und nicht als statisches Webverzeichnis
erreichbar sein.

## 4. Shopify verbinden

1. Eine Shopify-Custom-App für den Shop erstellen.
2. Die folgenden HTTPS-Webhooks auf das Backend registrieren:
   - `orders/paid` → `/webhooks/shopify/orders-paid`
   - `customers/redact` → `/webhooks/shopify/customers-redact`
   - `customers/data_request` → `/webhooks/shopify/customers-data-request`
   - `shop/redact` → `/webhooks/shopify/shop-redact`
3. Im Theme-Editor die Sektion **Couple Wear · Studio** öffnen.
4. Hoodie, T-Shirt und die öffentliche Backend-URL auswählen.
5. Niemals einen Schlüssel in das URL-Feld eintragen.

## 5. Sicherheitsstufen

Die Standardwerte verhindern kostenpflichtige Aktionen:

```dotenv
PRINTFUL_API_ENABLED=false
PRINTFUL_ORDER_MODE=manual
```

Erst nach erfolgreichen Testbestellungen darf `PRINTFUL_API_ENABLED=true` und
`PRINTFUL_ORDER_MODE=api-draft` gesetzt werden. Auch dann werden nur Entwürfe
erstellt; die Bestätigung erfolgt weiterhin manuell im Printful-Dashboard.
