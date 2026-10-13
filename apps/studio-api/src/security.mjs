import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
export const escapeXml = (value) => String(value || '').replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]);

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyShopifyHmac(body, received, secret) {
  if (!secret || !received) return false;
  const expected = createHmac('sha256', secret).update(body).digest('base64');
  return safeEqual(expected, received);
}

export function signAsset(designId, asset, expires, secret) {
  return createHmac('sha256', secret).update(`${designId}:${asset}:${expires}`).digest('hex');
}

export function verifyAssetSignature(designId, asset, expires, signature, secret, now = Date.now()) {
  const expiry = Number(expires);
  if (!Number.isFinite(expiry) || expiry * 1000 < now) return false;
  return safeEqual(signAsset(designId, asset, expiry, secret), signature);
}

export function createRateLimiter({ windowMs = 60_000, max = 8 } = {}) {
  const requests = new Map();
  return (key, now = Date.now()) => {
    const current = requests.get(key);
    if (!current || current.resetAt <= now) {
      requests.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    current.count += 1;
    return current.count <= max;
  };
}
