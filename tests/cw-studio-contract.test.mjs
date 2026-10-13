import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const liquid = read('snippets/cw-customizer.liquid');
const script = read('assets/cw-customizer.js');
const schema = read('blocks/buy-buttons.liquid');

test('the studio keeps every customer selection inside the native product form contract', () => {
  for (const property of [
    'properties[Namen]',
    'properties[Jahr]',
    'properties[Schriftstil]',
    'properties[Designstil]',
    'properties[_CW Design-ID]',
    'properties[_CW Produktionsstatus]',
  ]) {
    assert.match(liquid, new RegExp(property.replace(/[\[\]]/g, '\\$&')));
  }
  assert.match(liquid, /data-cw-photo-input/);
  assert.match(liquid, /data-cw-generate-button/);
  assert.match(liquid, /data-cw-print-file/);
});

test('the local fallback validates uploads and does not bypass the design gate', () => {
  assert.match(script, /MAX_FILE_SIZE = 10 \* 1024 \* 1024/);
  assert.match(script, /image\/jpeg', 'image\/png', 'image\/webp/);
  assert.match(script, /if \(!state\.designReady\)/);
  assert.match(script, /renderLineArt\(state\.photo, style\)/);
  assert.match(script, /data-cw-print-file/);
  assert.match(liquid, /properties\[_CW Printdatei\]/);
});

test('the configurable proxy and its fallback are both present', () => {
  assert.match(schema, /"id": "cw_ai_endpoint"/);
  assert.match(liquid, /data-cw-ai-endpoint/);
  assert.match(script, /requestRemoteDesign/);
  assert.match(script, /if \(!endpoint\) return null/);
});

test('the browser asset parses as JavaScript', () => {
  execFileSync(process.execPath, ['--check', resolve(root, 'assets/cw-customizer.js')], { stdio: 'pipe' });
});
