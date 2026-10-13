import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const landing = read('sections/cw-personalize-page.liquid');
const landingScript = read('assets/cw-personalize-page.js');
const product = read('snippets/cw-customizer.liquid');
const productScript = read('assets/cw-customizer.js');
const hero = read('sections/cw-hero.liquid');

test('the homepage links to the dedicated personalization route', () => {
  assert.match(hero, /pages\/personalisieren/);
  assert.match(hero, /personalization_page/);
});

test('the first step asks for names and date only', () => {
  assert.match(landing, /data-cw-start-names/);
  assert.match(landing, /data-cw-start-date/);
  assert.doesNotMatch(landing, /type="file"/);
  assert.doesNotMatch(landing, /Designstil|Schriftstil/);
});

test('personalization is carried to the selected product', () => {
  assert.match(landingScript, /cw_names/);
  assert.match(landingScript, /cw_date/);
  assert.match(landingScript, /sessionStorage\.setItem/);
  assert.match(productScript, /sessionStorage\.getItem/);
});

test('Shopify receives visible Printful personalization properties', () => {
  assert.match(product, /properties\[Namen\]/);
  assert.match(product, /properties\[Datum\]/);
  assert.match(product, /properties\[Personalisierung\]/);
  assert.match(product, /Printful-Personalisierung erforderlich/);
});

test('browser assets parse as JavaScript', () => {
  for (const file of ['assets/cw-personalize-page.js', 'assets/cw-customizer.js']) {
    execFileSync(process.execPath, ['--check', resolve(root, file)], { stdio: 'pipe' });
  }
});
