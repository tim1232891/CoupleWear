import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { buildImagePrompt, createArtwork, createPrintFile, sniffImage, STYLES } from '../src/image.mjs';
import sharp from 'sharp';
import { canCreatePrintfulDraft } from '../src/printful.mjs';
import { signAsset, verifyAssetSignature, verifyShopifyHmac } from '../src/security.mjs';

test('all four documented artwork styles have text-free print prompts', () => {
  assert.deepEqual(Object.keys(STYLES), ['minimal', 'heart', 'embrace', 'hands']);
  for (const style of Object.keys(STYLES)) {
    const prompt = buildImagePrompt(style);
    assert.match(prompt, /transparent background/i);
    assert.match(prompt, /Do not render names, dates/i);
  }
});

test('upload sniffing accepts supported signatures and rejects arbitrary bytes', () => {
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.equal(sniffImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
  assert.equal(sniffImage(Buffer.from('RIFF0000WEBP')), 'image/webp');
  assert.equal(sniffImage(Buffer.from('<script>alert(1)</script>')), '');
});

test('signed image links expire and cannot be altered', () => {
  const expires = Math.floor(Date.now() / 1000) + 60;
  const signature = signAsset('abc', 'preview', expires, 'secret');
  assert.equal(verifyAssetSignature('abc', 'preview', expires, signature, 'secret'), true);
  assert.equal(verifyAssetSignature('abc', 'print', expires, signature, 'secret'), false);
  assert.equal(verifyAssetSignature('abc', 'preview', 1, signature, 'secret'), false);
});

test('Shopify webhook verification uses the raw body', () => {
  const body = Buffer.from('{"id":123}');
  const hmac = createHmac('sha256', 'secret').update(body).digest('base64');
  assert.equal(verifyShopifyHmac(body, hmac, 'secret'), true);
  assert.equal(verifyShopifyHmac(Buffer.from('{"id":124}'), hmac, 'secret'), false);
});

test('Printful integration defaults to manual and never contains a confirmation call', () => {
  const config = loadConfig({ PRINTFUL_API_ENABLED: 'true', PRINTFUL_API_TOKEN: 'present' });
  assert.equal(config.printful.orderMode, 'manual');
  assert.equal(canCreatePrintfulDraft(config), false);
  const implementation = readFileSync(resolve(import.meta.dirname, '../src/printful.mjs'), 'utf8');
  assert.doesNotMatch(implementation, /\/confirmation|\/confirm|confirm=1/);
  assert.match(implementation, /\/v2\/orders/);
});

test('the print pipeline produces a transparent 300 DPI production canvas with exact text', async () => {
  const artwork = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><path d="M100 600 Q600 100 1100 600" fill="none" stroke="black" stroke-width="12"/></svg>');
  const result = await createPrintFile(artwork, { nameOne: 'Lena', nameTwo: 'David', date: '05.08.2022', extra: 'für immer wir', font: 'editorial' });
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.width, 4500);
  assert.equal(metadata.height, 5400);
  assert.equal(metadata.density, 300);
  assert.equal(metadata.hasAlpha, true);
});

test('demo generation strips metadata and converts artwork to black alpha lines', async () => {
  const upload = await sharp({ create: { width: 500, height: 500, channels: 3, background: '#dde8ed' } }).jpeg().toBuffer();
  const result = await createArtwork(upload, 'heart', { openAiKey: '', openAiModel: 'gpt-image-2', openAiBaseUrl: 'https://api.openai.com' });
  const { data, info } = await sharp(result.artwork).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1800);
  assert.equal(info.height, 1800);
  assert.equal(info.channels, 4);
  let transparentPixels = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index] === 0) transparentPixels += 1;
  assert.ok(transparentPixels > 100_000);
});
