import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { escapeXml } from './security.mjs';

export const STYLES = Object.freeze({
  minimal: 'Minimal Line Art',
  heart: 'Romantic Heart',
  embrace: 'Loving Embrace',
  hands: 'Hands of Love',
});

const STYLE_INSTRUCTIONS = {
  minimal: 'Create an elegant minimal portrait using very few delicate continuous black lines.',
  heart: 'Create elegant fine-line couple art with one graceful heart contour naturally framing the people.',
  embrace: 'Emphasize the couple’s affectionate pose with flowing, expressive continuous lines and a gentle embrace.',
  hands: 'If the hands are visible, emphasize connected hands and a subtle heart gesture; otherwise preserve the pose and use one small heart motif.',
};

const DEMO_ASSETS = {
  minimal: new URL('../../../assets/cw-style-minimal.svg', import.meta.url),
  heart: new URL('../../../assets/cw-style-heart.svg', import.meta.url),
  embrace: new URL('../../../assets/cw-style-embrace.svg', import.meta.url),
  hands: new URL('../../../assets/cw-style-hands.svg', import.meta.url),
};

export function sniffImage(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

export function buildImagePrompt(style) {
  if (!STYLES[style]) throw new Error('Unsupported design style.');
  return [
    'Transform the uploaded couple photo into premium printable black fine-line artwork.',
    STYLE_INSTRUCTIONS[style],
    'Preserve the recognizable pose, silhouettes, hairstyles, clothing contours, proportions, and relationship between the people as faithfully as possible.',
    'Use only crisp black lines with varied but delicate stroke weight. No gray fill, no color, no shading, no photorealism, no scenery, no border, no watermark.',
    'Do not render names, dates, letters, words, numbers, signatures, or logos. Text will be added programmatically later.',
    'Output one centered composition with generous padding on a fully transparent background. The PNG alpha channel must be real transparency, never a checkerboard or white rectangle.',
  ].join(' ');
}

export async function sanitizeUpload(buffer) {
  if (!sniffImage(buffer)) throw new Error('The uploaded file is not a valid JPG, PNG, or WebP image.');
  const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'error' }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || metadata.width < 400 || metadata.height < 400) throw new Error('The image resolution is too low. Use at least 400 × 400 pixels.');
  return image.resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
}

async function createWithOpenAi(input, style, config) {
  const payload = new FormData();
  payload.append('model', config.openAiModel);
  payload.append('image[]', new Blob([input], { type: 'image/png' }), 'couple-input.png');
  payload.append('prompt', buildImagePrompt(style));
  payload.append('size', '1024x1024');
  payload.append('quality', 'medium');
  payload.append('background', 'transparent');
  payload.append('output_format', 'png');

  const response = await fetch(`${config.openAiBaseUrl}/v1/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openAiKey}` },
    body: payload,
    signal: AbortSignal.timeout(180_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || 'The image provider rejected the request.');
  const encoded = body?.data?.[0]?.b64_json;
  if (!encoded) throw new Error('The image provider returned no artwork.');
  return Buffer.from(encoded, 'base64');
}

async function createDemo(style) {
  const svg = await readFile(DEMO_ASSETS[style]);
  return sharp(svg, { density: 300 }).resize(1200, 1200, { fit: 'contain' }).png({ compressionLevel: 9 }).toBuffer();
}

export async function createArtwork(input, style, config) {
  const sanitized = await sanitizeUpload(input);
  const artwork = config.openAiKey ? await createWithOpenAi(sanitized, style, config) : await createDemo(style);
  const grayscale = await sharp(artwork, { limitInputPixels: 40_000_000, failOn: 'error' })
    .resize(1800, 1800, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .flatten({ background: '#ffffff' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(grayscale.info.width * grayscale.info.height * 4);
  for (let source = 0, target = 0; source < grayscale.data.length; source += 1, target += 4) {
    const alpha = Math.max(0, Math.min(255, Math.round((255 - grayscale.data[source]) * 1.25)));
    rgba[target] = 0;
    rgba[target + 1] = 0;
    rgba[target + 2] = 0;
    rgba[target + 3] = alpha;
  }
  const normalized = await sharp(rgba, { raw: { width: grayscale.info.width, height: grayscale.info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const metadata = await sharp(normalized).metadata();
  if (!metadata.hasAlpha || (metadata.width || 0) < 1200 || (metadata.height || 0) < 1200) throw new Error('Generated artwork did not pass the transparency or resolution check.');
  return { artwork: normalized, provider: config.openAiKey ? 'openai' : 'demo', model: config.openAiKey ? config.openAiModel : 'local-demo' };
}

export async function createPrintFile(artwork, personalization) {
  const names = [personalization.nameOne, personalization.nameTwo].map((value) => String(value || '').trim()).filter(Boolean).join(' & ');
  if (!names || names.length > 40) throw new Error('Names are missing or too long.');
  const date = String(personalization.date || '').trim().slice(0, 20);
  const extra = String(personalization.extra || '').trim().slice(0, 28);
  const font = ['signature', 'editorial', 'modern'].includes(personalization.font) ? personalization.font : 'signature';
  const fonts = { signature: 'URW Chancery L, cursive', editorial: 'DejaVu Serif, serif', modern: 'DejaVu Sans, sans-serif' };
  const nameSize = Math.max(150, Math.min(310, Math.floor(5000 / Math.max(names.length, 16))));
  const textSvg = Buffer.from(`<svg width="4500" height="1500" viewBox="0 0 4500 1500" xmlns="http://www.w3.org/2000/svg">
    <style>.names{font-family:${fonts[font]};font-size:${nameSize}px;font-weight:${font === 'modern' ? 600 : 400};letter-spacing:${font === 'modern' ? 18 : 2}px}.date{font-family:DejaVu Serif,serif;font-size:118px;letter-spacing:26px}.extra{font-family:DejaVu Sans,sans-serif;font-size:82px;letter-spacing:10px}</style>
    <text class="names" x="2250" y="510" fill="#000" text-anchor="middle">${escapeXml(names)}</text>
    <text class="date" x="2250" y="790" fill="#000" text-anchor="middle">${escapeXml(date)}</text>
    <text class="extra" x="2250" y="1010" fill="#000" text-anchor="middle">${escapeXml(extra)}</text>
  </svg>`);
  const preparedArtwork = await sharp(artwork).resize(3300, 3300, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const output = await sharp({ create: { width: 4500, height: 5400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: preparedArtwork, left: 600, top: 250 }, { input: textSvg, left: 0, top: 3650 }])
    .png({ compressionLevel: 9 })
    .withMetadata({ density: 300 })
    .toBuffer();
  const metadata = await sharp(output).metadata();
  if (metadata.width !== 4500 || metadata.height !== 5400 || !metadata.hasAlpha) throw new Error('Print file validation failed.');
  return { buffer: output, width: 4500, height: 5400, dpi: 300 };
}
