import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const studioSection = read('sections/cw-personalize-page.liquid');
const studio = read('snippets/cw-personalize-studio.liquid');
const studioScript = read('assets/cw-personalize-page.js');
const product = read('snippets/cw-customizer.liquid');
const productScript = read('assets/cw-customizer.js');
const hero = read('sections/cw-hero.liquid');
const mainPage = read('sections/main-page.liquid');

test('the homepage links to the dedicated personalization route', () => {
  assert.match(hero, /pages\/personalisieren/);
  assert.match(hero, /personalization_page/);
});

test('the default page template falls back to the studio for the personalization handle', () => {
  assert.match(mainPage, /page\.handle == 'personalisieren'/);
  assert.match(mainPage, /render 'cw-personalize-studio'/);
  assert.match(studioSection, /render 'cw-personalize-studio'/);
});

test('the studio renders a native Shopify product form on the personalization page', () => {
  assert.match(studio, /form 'product', cw_product/);
  assert.match(studio, /name="id"/);
  assert.match(studio, /data-cw-variant-select/);
  assert.match(studio, /type="submit"/);
});

test('the studio provides secure photo input, four styles and an exact text preview', () => {
  assert.match(studio, /type="file"/);
  assert.match(studio, /image\/jpeg,image\/png,image\/webp/);
  assert.match(studio, /data-cw-consent/);
  assert.match(studio, /data-cw-name-one/);
  assert.match(studio, /data-cw-name-two/);
  assert.match(studio, /data-cw-date/);
  assert.match(studio, /data-cw-names-preview/);
  assert.match(studio, /data-cw-date-preview/);
  assert.equal((studio.match(/data-cw-style data-preview-url/g) || []).length, 4);
  assert.match(studioScript, /MAX_FILE_SIZE/);
  assert.match(studioScript, /FormData/);
});

test('Shopify receives visible Printful personalization properties', () => {
  for (const markup of [studio, product]) {
    assert.match(markup, /properties\[Namen\]/);
    assert.match(markup, /properties\[Datum\]/);
    assert.match(markup, /properties\[Personalisierung\]/);
    assert.match(markup, /Printful-Personalisierung erforderlich|Manuelle Druckfreigabe erforderlich/);
  }
});

test('the front end never exposes a Printful token', () => {
  for (const source of [studio, studioScript, product, productScript]) {
    assert.doesNotMatch(source, /Authorization:\s*Bearer/i);
    assert.doesNotMatch(source, /PRINTFUL_TOKEN/i);
  }
});

test('the front end never exposes an OpenAI key or calls OpenAI directly', () => {
  for (const source of [studio, studioScript]) {
    assert.doesNotMatch(source, /OPENAI_API_KEY/);
    assert.doesNotMatch(source, /api\.openai\.com/);
  }
});

test('personal text is separate from the AI generation request', () => {
  assert.match(studio, /properties\[Name 1\]/);
  assert.match(studio, /properties\[Name 2\]/);
  assert.match(studio, /properties\[Schriftart\]/);
  assert.doesNotMatch(studioScript, /payload\.append\(['"](?:name|date|extra)/);
});

test('the generated campaign visual is part of the theme', () => {
  assert.ok(existsSync(resolve(root, 'assets/cw-editorial-couple-2026.webp')));
  assert.match(hero, /cw-editorial-couple-2026\.webp/);
  assert.match(hero, /KI-generiertes Editorialmotiv/);
});

test('browser assets parse as JavaScript', () => {
  for (const file of ['assets/cw-personalize-page.js', 'assets/cw-customizer.js']) {
    execFileSync(process.execPath, ['--check', resolve(root, file)], { stdio: 'pipe' });
  }
});
