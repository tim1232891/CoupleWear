import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const studio = read('sections/cw-personalize-page.liquid');
const studioScript = read('assets/cw-personalize-page.js');
const product = read('snippets/cw-customizer.liquid');
const productScript = read('assets/cw-customizer.js');
const hero = read('sections/cw-hero.liquid');

test('the homepage links to the dedicated personalization route', () => {
  assert.match(hero, /pages\/personalisieren/);
  assert.match(hero, /personalization_page/);
});

test('the studio renders a native Shopify product form on the personalization page', () => {
  assert.match(studio, /form 'product', cw_product/);
  assert.match(studio, /name="id"/);
  assert.match(studio, /data-cw-variant-select/);
  assert.match(studio, /type="submit"/);
});

test('the studio asks for names and date and provides a live preview', () => {
  assert.match(studio, /data-cw-names/);
  assert.match(studio, /data-cw-date/);
  assert.match(studio, /data-cw-names-preview/);
  assert.match(studio, /data-cw-date-preview/);
  assert.doesNotMatch(studio, /type="file"/);
});

test('Shopify receives visible Printful personalization properties', () => {
  for (const markup of [studio, product]) {
    assert.match(markup, /properties\[Namen\]/);
    assert.match(markup, /properties\[Datum\]/);
    assert.match(markup, /properties\[Personalisierung\]/);
    assert.match(markup, /Printful-Personalisierung erforderlich/);
  }
});

test('the front end never exposes a Printful token', () => {
  for (const source of [studio, studioScript, product, productScript]) {
    assert.doesNotMatch(source, /Authorization:\s*Bearer/i);
    assert.doesNotMatch(source, /PRINTFUL_TOKEN/i);
  }
});

test('the generated campaign visual is part of the theme', () => {
  assert.ok(existsSync(resolve(root, 'assets/cw-couple-hero-v2.webp')));
  assert.match(hero, /cw-couple-hero-v2\.webp/);
});

test('browser assets parse as JavaScript', () => {
  for (const file of ['assets/cw-personalize-page.js', 'assets/cw-customizer.js']) {
    execFileSync(process.execPath, ['--check', resolve(root, file)], { stdio: 'pipe' });
  }
});
