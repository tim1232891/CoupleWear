import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { buildImagePrompt, createArtwork, createPrintFile, imageRequestSettings, sniffImage, STYLES } from '../src/image.mjs';
import sharp from 'sharp';
import { canCreatePrintfulDraft } from '../src/printful.mjs';
import { signAsset, verifyAssetSignature, verifyShopifyHmac } from '../src/security.mjs';

test('all four documented artwork styles have text-free print prompts', () => {
  assert.deepEqual(Object.keys(STYLES), ['minimal', 'heart', 'embrace', 'hands']);
  for (const style of Object.keys(STYLES)) {
    const prompt = buildImagePrompt(style);
    assert.match(prompt, /transparent background/i);
    assert.match(prompt, /Do not render names, dates/i);
    assert.match(prompt, /immediately recognizable/i);
    assert.match(prompt, /generic illustration face/i);
  }
});

test('image generation defaults to the high-fidelity editing profile', () => {
  const config = loadConfig({});
  assert.equal(config.openAiModel, 'gpt-image-2.5-sunburst');
  assert.equal(config.openAiQuality, 'high');
  assert.equal(config.openAiSize, '2048x2048');
  assert.equal(config.openAiTimeoutMs, 300_000);
  assert.deepEqual(imageRequestSettings(config), {
    model: 'gpt-image-2.5-sunburst',
    size: '2048x2048',
    quality: 'high',
    background: 'transparent',
    outputFormat: 'png',
  });
  assert.match(buildImagePrompt('minimal', 2), /refinement attempt/i);
});

test('unsupported image settings fall back to safe production defaults', () => {
  const config = loadConfig({ OPENAI_IMAGE_QUALITY: 'ultra', OPENAI_IMAGE_SIZE: '999x777', OPENAI_IMAGE_TIMEOUT_MS: '1' });
  assert.equal(config.openAiQuality, 'high');
  assert.equal(config.openAiSize, '2048x2048');
  assert.equal(config.openAiTimeoutMs, 60_000);
  assert.equal(imageRequestSettings({ openAiModel: 'gpt-image-2', openAiQuality: 'max' }).quality, 'high');
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

test('OpenAI edit requests use the configured HD identity profile', async (context) => {
  const upload = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#dde8ed"/><circle cx="300" cy="320" r="140" fill="#40504c"/><circle cx="520" cy="320" r="140" fill="#71817c"/></svg>')).png().toBuffer();
  const providerImage = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048"><g fill="none" stroke="#000" stroke-width="30"><circle cx="720" cy="760" r="330"/><circle cx="1328" cy="760" r="330"/><path d="M420 1750 Q1024 1050 1628 1750"/></g></svg>')).png().toBuffer();
  const originalFetch = globalThis.fetch;
  let captured;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => ({ data: [{ b64_json: providerImage.toString('base64') }] }) };
  };

  const config = loadConfig({
    OPENAI_API_KEY: 'test-only-key',
    OPENAI_IMAGE_MODEL: 'gpt-image-2.5-sunburst',
    OPENAI_IMAGE_QUALITY: 'high',
    OPENAI_IMAGE_SIZE: '2048x2048',
  });
  const result = await createArtwork(upload, 'minimal', config, { attempt: 2 });

  assert.equal(captured.url, 'https://api.openai.com/v1/images/edits');
  assert.equal(captured.options.body.get('model'), 'gpt-image-2.5-sunburst');
  assert.equal(captured.options.body.get('quality'), 'high');
  assert.equal(captured.options.body.get('size'), '2048x2048');
  assert.equal(captured.options.body.get('background'), 'transparent');
  assert.match(captured.options.body.get('prompt'), /refinement attempt/i);
  assert.ok(captured.options.body.get('image[]') instanceof Blob);
  assert.equal(result.provider, 'openai');
  assert.equal(result.quality, 'high');
});

test('local fallback converts the uploaded photo into black alpha contours', async () => {
  const upload = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#dde8ed"/><circle cx="280" cy="310" r="120" fill="#30433f"/><circle cx="520" cy="310" r="120" fill="#61736e"/><path d="M180 700 Q400 430 620 700" fill="#82938e"/></svg>')).jpeg().toBuffer();
  const result = await createArtwork(upload, 'heart', { openAiKey: '', openAiModel: 'gpt-image-2', openAiBaseUrl: 'https://api.openai.com' });
  assert.equal(result.provider, 'local-contour');
  assert.equal(result.model, 'sharp-sobel-v1');
  const { data, info } = await sharp(result.artwork).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 2400);
  assert.equal(info.height, 2400);
  assert.equal(info.channels, 4);
  let transparentPixels = 0;
  let inkPixels = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] === 0) transparentPixels += 1;
    if (data[index] >= 20) inkPixels += 1;
  }
  assert.ok(transparentPixels > 100_000);
  assert.ok(inkPixels > 1_000);
});
