import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const bool = (value) => String(value || '').toLowerCase() === 'true';
const integer = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function loadConfig(env = process.env) {
  const orderMode = env.PRINTFUL_ORDER_MODE === 'api-draft' ? 'api-draft' : 'manual';
  return {
    port: integer(env.PORT, 9292),
    publicBaseUrl: String(env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
    allowedOrigins: new Set(String(env.ALLOWED_ORIGINS || 'http://localhost:9292').split(',').map((value) => value.trim()).filter(Boolean)),
    storageRoot: resolve(env.STORAGE_ROOT || new URL('../var/private', import.meta.url).pathname),
    signingSecret: env.SIGNING_SECRET || randomBytes(32).toString('hex'),
    retentionHours: integer(env.DESIGN_RETENTION_HOURS, 24),
    openAiKey: env.OPENAI_API_KEY || '',
    openAiModel: env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
    openAiBaseUrl: String(env.OPENAI_API_BASE_URL || 'https://api.openai.com').replace(/\/$/, ''),
    shopifySecret: env.SHOPIFY_API_SECRET || '',
    printful: {
      enabled: bool(env.PRINTFUL_API_ENABLED),
      orderMode,
      token: env.PRINTFUL_API_TOKEN || '',
      storeId: env.PRINTFUL_STORE_ID || '',
      baseUrl: String(env.PRINTFUL_API_BASE_URL || 'https://api.printful.com').replace(/\/$/, ''),
      variantMap: parseVariantMap(env.PRINTFUL_VARIANT_MAP_JSON),
    },
  };
}

function parseVariantMap(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error('PRINTFUL_VARIANT_MAP_JSON must contain valid JSON.');
  }
}
