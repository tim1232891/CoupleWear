import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from './config.mjs';
import { createArtwork, createPrintFile, STYLES } from './image.mjs';
import { canCreatePrintfulDraft, createPrintfulDraft } from './printful.mjs';
import { createRateLimiter, sha256, signAsset, verifyAssetSignature, verifyShopifyHmac } from './security.mjs';
import { createStorage } from './storage.mjs';

const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const config = loadConfig();
const storage = createStorage(config.storageRoot);
const allowDesignRequest = createRateLimiter({ windowMs: 60_000, max: 5 });
const statePath = join(config.storageRoot, 'webhook-state.json');

await storage.init();
await storage.cleanup();
setInterval(() => storage.cleanup().catch((error) => log('cleanup_failed', { message: error.message })), 60 * 60 * 1000).unref();

function log(event, details = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, ...details }));
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  const allowed = origin && config.allowedOrigins.has(origin);
  return {
    ...(allowed ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-CW-Delete-Token,X-Shopify-Hmac-Sha256,X-Shopify-Shop-Domain,X-Shopify-Topic',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function sendJson(response, status, body, request) {
  response.writeHead(status, {
    ...corsHeaders(request),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  response.end(JSON.stringify(body));
}

async function readBody(request, maximum = MAX_REQUEST_BYTES) {
  const declared = Number(request.headers['content-length'] || 0);
  if (declared > maximum) throw Object.assign(new Error('Request is too large.'), { status: 413 });
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maximum) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function publicBase(request) {
  if (config.publicBaseUrl) return config.publicBaseUrl;
  const protocol = request.headers['x-forwarded-proto'] || 'http';
  return `${protocol}://${request.headers.host}`;
}

function signedAssetUrl(request, designId, asset, lifetimeSeconds = 1800) {
  const expires = Math.floor(Date.now() / 1000) + lifetimeSeconds;
  const signature = signAsset(designId, asset, expires, config.signingSecret);
  const leaf = asset === 'preview' ? 'preview' : 'print-file';
  return `${publicBase(request)}/api/v1/designs/${designId}/${leaf}?expires=${expires}&signature=${signature}`;
}

async function handleDesignCreation(request, response) {
  const origin = request.headers.origin;
  if (origin && !config.allowedOrigins.has(origin)) return sendJson(response, 403, { message: 'Origin is not allowed.' }, request);
  const rateKey = sha256(request.socket.remoteAddress || 'unknown');
  if (!allowDesignRequest(rateKey)) return sendJson(response, 429, { message: 'Zu viele Versuche. Bitte warte eine Minute.' }, request);

  const raw = await readBody(request);
  const parsedRequest = new Request('http://studio.local/api/v1/designs', {
    method: 'POST',
    headers: new Headers(request.headers),
    body: raw,
  });
  const form = await parsedRequest.formData();
  const photo = form.get('photo');
  const style = String(form.get('style') || '');
  if (!photo || typeof photo.arrayBuffer !== 'function') throw Object.assign(new Error('Bitte lade ein Foto hoch.'), { status: 400 });
  if (photo.size > 10 * 1024 * 1024) throw Object.assign(new Error('Das Foto darf höchstens 10 MB groß sein.'), { status: 413 });
  if (!STYLES[style]) throw Object.assign(new Error('Bitte wähle einen gültigen Designstil.'), { status: 400 });
  if (String(form.get('consent')) !== 'true') throw Object.assign(new Error('Die Einwilligung zur Bildverarbeitung fehlt.'), { status: 400 });

  const input = Buffer.from(await photo.arrayBuffer());
  const designId = randomUUID();
  const deleteToken = randomBytes(32).toString('base64url');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + config.retentionHours * 60 * 60 * 1000);
  const generated = await createArtwork(input, style, config);
  await storage.create(designId, {
    version: 1,
    designId,
    style,
    provider: generated.provider,
    model: generated.model,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    deleteTokenHash: sha256(deleteToken),
    productionReady: false,
  }, generated.artwork);

  log('design_created', { designId, mode: generated.provider, style });
  return sendJson(response, 201, {
    designId,
    deleteToken,
    previewUrl: signedAssetUrl(request, designId, 'preview'),
    expiresAt: expiresAt.toISOString(),
    productionReady: false,
    mode: generated.provider,
  }, request);
}

async function handleAsset(request, response, url, match) {
  const [, designId, leaf] = match;
  const asset = leaf === 'preview' ? 'preview' : 'print';
  if (!verifyAssetSignature(designId, asset, url.searchParams.get('expires'), url.searchParams.get('signature'), config.signingSecret)) {
    return sendJson(response, 403, { message: 'Der Bildlink ist ungültig oder abgelaufen.' }, request);
  }
  const data = await readFile(storage.assetPath(designId, asset));
  response.writeHead(200, {
    ...corsHeaders(request),
    'Content-Type': 'image/png',
    'Content-Length': data.length,
    'Cache-Control': 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  });
  response.end(data);
}

async function handleDesignDeletion(request, response, designId) {
  const raw = await readBody(request, 16_384);
  const payload = JSON.parse(raw.toString('utf8') || '{}');
  const manifest = await storage.read(designId);
  if (!payload.deleteToken || sha256(payload.deleteToken) !== manifest.deleteTokenHash) return sendJson(response, 403, { message: 'Löschberechtigung ungültig.' }, request);
  await storage.delete(designId);
  log('design_deleted', { designId, reason: 'customer_request' });
  response.writeHead(204, corsHeaders(request));
  response.end();
}

async function loadWebhookState() {
  try { return JSON.parse(await readFile(statePath, 'utf8')); } catch { return {}; }
}

async function saveWebhookState(state) {
  await mkdir(config.storageRoot, { recursive: true, mode: 0o700 });
  const temporary = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  await rename(temporary, statePath);
}

function propertiesOf(lineItem) {
  return Object.fromEntries((lineItem.properties || []).map((property) => [property.name, property.value]));
}

function recipientFrom(order) {
  const address = order.shipping_address || {};
  return {
    name: cleanJoin(address.first_name, address.last_name),
    company: address.company || undefined,
    address1: address.address1,
    address2: address.address2 || undefined,
    city: address.city,
    state_code: address.province_code || undefined,
    country_code: address.country_code,
    zip: address.zip,
    phone: address.phone || undefined,
    email: order.email || undefined,
  };
}

function cleanJoin(...parts) {
  return parts.filter(Boolean).join(' ').trim();
}

async function processPaidOrder(order, request) {
  const state = await loadWebhookState();
  const key = `shopify:${order.id}`;
  if (state[key]?.status === 'complete' || state[key]?.status === 'processing') return state[key];
  state[key] = { status: 'processing', updatedAt: new Date().toISOString() };
  await saveWebhookState(state);

  try {
    const orderItems = [];
    for (const lineItem of order.line_items || []) {
      const properties = propertiesOf(lineItem);
      const designId = properties['_CW Design-ID'];
      if (!designId || !/^[a-f0-9-]{36}$/.test(designId)) continue;
      const mapping = config.printful.variantMap[String(lineItem.variant_id)];
      if (!mapping && canCreatePrintfulDraft(config)) throw new Error(`No Printful mapping for Shopify variant ${lineItem.variant_id}.`);

      const artwork = await readFile(storage.assetPath(designId, 'preview'));
      const print = await createPrintFile(artwork, {
        nameOne: properties['Name 1'],
        nameTwo: properties['Name 2'],
        date: properties.Datum,
        extra: properties.Zusatztext,
        font: properties.Schriftart,
      });
      await storage.writePrint(designId, print.buffer);
      await storage.update(designId, {
        productionReady: true,
        print: { width: print.width, height: print.height, dpi: print.dpi },
        orderHash: sha256(order.id),
        customerHash: order.customer?.id ? sha256(order.customer.id) : null,
        shopHash: sha256(request.headers['x-shopify-shop-domain'] || ''),
      });

      if (mapping) {
        const placement = properties.Druckposition === 'back' ? 'back' : mapping.placement || 'front';
        orderItems.push({
          catalog_variant_id: Number(mapping.catalogVariantId),
          source: 'catalog',
          quantity: Number(lineItem.quantity || 1),
          placements: [{ placement, technique: mapping.technique || 'dtg', layers: [{ type: 'file', url: signedAssetUrl(request, designId, 'print', 7 * 24 * 60 * 60) }] }],
        });
      }
    }

    let printfulDraftId = null;
    if (canCreatePrintfulDraft(config) && orderItems.length > 0) {
      if (!publicBase(request).startsWith('https://')) throw new Error('PUBLIC_BASE_URL must use HTTPS before Printful draft creation can be enabled.');
      const draft = await createPrintfulDraft({ recipient: recipientFrom(order), items: orderItems, externalId: `shopify-${order.id}` }, config);
      printfulDraftId = draft?.id || null;
    }

    state[key] = { status: 'complete', updatedAt: new Date().toISOString(), printfulDraftId, mode: config.printful.orderMode };
    await saveWebhookState(state);
    log('paid_order_processed', { orderHash: sha256(order.id), itemCount: orderItems.length, draftCreated: Boolean(printfulDraftId) });
    return state[key];
  } catch (error) {
    state[key] = { status: 'failed', updatedAt: new Date().toISOString(), reason: error.message };
    await saveWebhookState(state);
    throw error;
  }
}

async function handleShopifyWebhook(request, response, topic) {
  const raw = await readBody(request, 2 * 1024 * 1024);
  if (!verifyShopifyHmac(raw, request.headers['x-shopify-hmac-sha256'], config.shopifySecret)) return sendJson(response, 401, { message: 'Invalid webhook signature.' }, request);
  const payload = JSON.parse(raw.toString('utf8'));

  if (topic === 'orders-paid') {
    await processPaidOrder(payload, request);
  } else if (topic === 'customers-redact') {
    const customerHash = payload.customer?.id ? sha256(payload.customer.id) : '';
    const removed = customerHash ? await storage.deleteWhere((manifest) => manifest.customerHash === customerHash) : 0;
    log('privacy_redaction_complete', { topic, removed });
  } else if (topic === 'shop-redact') {
    const shopHash = sha256(payload.shop_domain || request.headers['x-shopify-shop-domain'] || '');
    const removed = await storage.deleteWhere((manifest) => manifest.shopHash === shopHash);
    log('privacy_redaction_complete', { topic, removed });
  } else if (topic === 'customers-data-request') {
    log('privacy_data_request_received', { requestHash: sha256(payload.data_request?.id || randomUUID()) });
  }
  return sendJson(response, 200, { received: true }, request);
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeaders(request));
      return response.end();
    }
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { status: 'ok', imageMode: config.openAiKey ? 'openai' : 'demo', printfulDrafts: canCreatePrintfulDraft(config) }, request);
    if (request.method === 'POST' && url.pathname === '/api/v1/designs') return await handleDesignCreation(request, response);

    const assetMatch = url.pathname.match(/^\/api\/v1\/designs\/([a-f0-9-]{36})\/(preview|print-file)$/);
    if (request.method === 'GET' && assetMatch) return await handleAsset(request, response, url, assetMatch);
    const deleteMatch = url.pathname.match(/^\/api\/v1\/designs\/([a-f0-9-]{36})\/delete$/);
    if (request.method === 'POST' && deleteMatch) return await handleDesignDeletion(request, response, deleteMatch[1]);

    const webhookMatch = url.pathname.match(/^\/webhooks\/shopify\/(orders-paid|customers-redact|customers-data-request|shop-redact)$/);
    if (request.method === 'POST' && webhookMatch) return await handleShopifyWebhook(request, response, webhookMatch[1]);
    return sendJson(response, 404, { message: 'Not found.' }, request);
  } catch (error) {
    const status = Number(error.status) || (error.code === 'ENOENT' ? 404 : 500);
    log('request_failed', { path: request.url?.split('?')[0], status, message: error.message });
    return sendJson(response, status, { message: status >= 500 ? 'Die Anfrage konnte nicht verarbeitet werden.' : error.message }, request);
  }
});

server.listen(config.port, () => {
  log('studio_api_started', {
    port: config.port,
    imageMode: config.openAiKey ? 'openai' : 'demo',
    printfulMode: config.printful.orderMode,
    ephemeralSigningSecret: !process.env.SIGNING_SECRET,
  });
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
