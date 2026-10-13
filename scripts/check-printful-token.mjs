import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const envText = await readFile(resolve(process.cwd(), '.env'), 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')];
    }),
);

if (!env.PRINTFUL_API_TOKEN) {
  console.error('PRINTFUL_API_TOKEN fehlt in .env.');
  process.exitCode = 1;
} else {
  const baseUrl = env.PRINTFUL_API_BASE_URL || 'https://api.printful.com';
  const headers = { Authorization: `Bearer ${env.PRINTFUL_API_TOKEN}` };
  if (env.PRINTFUL_STORE_ID) headers['X-PF-Store-Id'] = env.PRINTFUL_STORE_ID;

  const response = await fetch(`${baseUrl}/oauth/scopes`, { headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(`Printful-Verbindung fehlgeschlagen (HTTP ${response.status}).`);
    process.exitCode = 1;
  } else {
    const scopes = payload?.result?.scopes?.map((entry) => entry.scope).filter(Boolean) || [];
    console.log('Printful-Token ist gültig.');
    console.log(`Berechtigungen: ${scopes.join(', ') || 'keine Angaben'}`);
  }
}
