import sharp from 'sharp';
import { escapeXml } from './security.mjs';

export const STYLES = Object.freeze({
  minimal: 'Minimal Line Art',
  heart: 'Romantic Heart',
  embrace: 'Loving Embrace',
  hands: 'Hands of Love',
});

const STYLE_INSTRUCTIONS = {
  minimal: 'Create an elegant clean-line portrait. Keep the composition minimal, but use enough precise facial and hair detail that both people remain individually recognizable.',
  heart: 'Create elegant fine-line couple art with one graceful heart contour naturally framing the people. The heart is secondary and must never cover faces or identifying features.',
  embrace: 'Preserve the exact affectionate pose and contact points with flowing lines. Keep both faces, hairstyles, body proportions, arms, and visible hands faithful to the photo.',
  hands: 'Preserve both people and their exact pose. If hands are clearly visible, draw their real position accurately and add only a subtle heart gesture; never invent fingers or hand poses.',
};

const LOCAL_EDGE_PROFILE = {
  minimal: { blur: 1.1, threshold: 24, gain: 7 },
  heart: { blur: 0.9, threshold: 20, gain: 8 },
  embrace: { blur: 0.8, threshold: 18, gain: 8 },
  hands: { blur: 0.7, threshold: 16, gain: 9 },
};

export function sniffImage(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

export function buildImagePrompt(style, attempt = 1) {
  if (!STYLES[style]) throw new Error('Unsupported design style.');
  return [
    'Create an identity-preserving portrait trace from the uploaded couple photo for premium apparel printing.',
    'The two real people in the input photo are the sole factual reference. This is an image edit, not a new imaginary couple.',
    'Highest priority: both people must be immediately recognizable as the same individuals.',
    'Preserve each person’s exact face shape, head angle, hairline, hairstyle, eyebrows, eye shape and spacing, nose, lips, jawline, ears, glasses, facial hair, distinguishing features, apparent age, skin-tone relationship, body build, pose, clothing neckline, and relative position.',
    'Do not beautify, idealize, age, de-age, slim, change ethnicity, change gender expression, swap features between people, make faces symmetrical, or replace either face with a generic illustration face.',
    'Do not omit eyes, noses, mouths, glasses, facial hair, or other identity-bearing details merely to make the drawing more minimal.',
    STYLE_INSTRUCTIONS[style],
    'Trace only contours and selected identity-bearing interior details that are visible in the photo. Preserve the crop and camera angle. Do not invent hidden limbs, fingers, clothing, accessories, or background objects.',
    'Use crisp pure-black ink lines with delicate varied stroke weight and restrained cross-contour detail around faces and hair. No gray fill, no color, no tonal shading, no photorealism, no scenery, no border, no watermark.',
    'Do not render names, dates, letters, words, numbers, signatures, or logos. Text will be added programmatically later.',
    'Output one centered, print-ready composition with generous padding on a fully transparent background. Preserve the transparent background; never paint a checkerboard, white rectangle, studio backdrop, drop shadow, or glow.',
    Number(attempt) > 1 ? 'This is a refinement attempt: prioritize closer facial likeness and more accurate distinguishing details than a generic stylization.' : '',
  ].join(' ');
}

export function imageRequestSettings(config = {}) {
  const model = config.openAiModel || 'gpt-image-2.5-sunburst';
  const supportsExtendedQuality = /^gpt-image-2\.5(?:-|$)/.test(model);
  const requestedQuality = config.openAiQuality || 'high';
  const quality = !supportsExtendedQuality && ['xhigh', 'max'].includes(requestedQuality) ? 'high' : requestedQuality;
  return {
    model,
    size: config.openAiSize || '2048x2048',
    quality,
    background: 'transparent',
    outputFormat: 'png',
  };
}

export async function sanitizeUpload(buffer) {
  if (!sniffImage(buffer)) throw new Error('The uploaded file is not a valid JPG, PNG, or WebP image.');
  const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'error' }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || Math.min(metadata.width, metadata.height) < 640) {
    throw new Error('Die Fotoauflösung ist zu niedrig. Nutze ein scharfes Foto mit mindestens 640 Pixeln an der kurzen Kante.');
  }
  return image
    .toColourspace('srgb')
    .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
    .sharpen({ sigma: 0.6, m1: 0.4, m2: 0.2 })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function createWithOpenAi(input, style, config, attempt) {
  const settings = imageRequestSettings(config);
  const payload = new FormData();
  payload.append('model', settings.model);
  payload.append('image[]', new Blob([input], { type: 'image/png' }), 'couple-input.png');
  payload.append('prompt', buildImagePrompt(style, attempt));
  payload.append('size', settings.size);
  payload.append('quality', settings.quality);
  payload.append('background', settings.background);
  payload.append('output_format', settings.outputFormat);
  payload.append('n', '1');

  const response = await fetch(`${config.openAiBaseUrl}/v1/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openAiKey}` },
    body: payload,
    signal: AbortSignal.timeout(config.openAiTimeoutMs || 300_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || 'The image provider rejected the request.');
  const encoded = body?.data?.[0]?.b64_json;
  if (!encoded) throw new Error('The image provider returned no artwork.');
  return Buffer.from(encoded, 'base64');
}

async function createLocalContour(input, style) {
  const profile = LOCAL_EDGE_PROFILE[style];
  const { data, info } = await sharp(input)
    .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: false })
    .flatten({ background: '#ffffff' })
    .grayscale()
    .normalise()
    .blur(profile.blur)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const topLeft = data[index - width - 1];
      const top = data[index - width];
      const topRight = data[index - width + 1];
      const left = data[index - 1];
      const right = data[index + 1];
      const bottomLeft = data[index + width - 1];
      const bottom = data[index + width];
      const bottomRight = data[index + width + 1];
      const horizontal = -topLeft - (2 * left) - bottomLeft + topRight + (2 * right) + bottomRight;
      const vertical = -topLeft - (2 * top) - topRight + bottomLeft + (2 * bottom) + bottomRight;
      const magnitude = Math.sqrt((horizontal * horizontal) + (vertical * vertical));
      const alpha = Math.max(0, Math.min(255, Math.round((magnitude - profile.threshold) * profile.gain)));
      const target = index * 4;
      rgba[target] = 0;
      rgba[target + 1] = 0;
      rgba[target + 2] = 0;
      rgba[target + 3] = alpha;
    }
  }

  return sharp(rgba, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

export async function createArtwork(input, style, config, options = {}) {
  const sanitized = await sanitizeUpload(input);
  const attempt = Math.max(1, Math.min(Number(options.attempt) || 1, 5));
  const artwork = config.openAiKey ? await createWithOpenAi(sanitized, style, config, attempt) : await createLocalContour(sanitized, style);
  const grayscale = await sharp(artwork, { limitInputPixels: 40_000_000, failOn: 'error' })
    .resize(2400, 2400, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
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
  let inkPixels = 0;
  for (let index = 3; index < rgba.length; index += 4) if (rgba[index] >= 20) inkPixels += 1;
  const inkCoverage = inkPixels / (grayscale.info.width * grayscale.info.height);
  if (config.openAiKey && (inkCoverage < 0.002 || inkCoverage > 0.55)) throw new Error('Das erzeugte Design hat die technische Linienprüfung nicht bestanden. Bitte erneut erstellen.');
  const normalized = await sharp(rgba, { raw: { width: grayscale.info.width, height: grayscale.info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const metadata = await sharp(normalized).metadata();
  if (!metadata.hasAlpha || (metadata.width || 0) < 2000 || (metadata.height || 0) < 2000) throw new Error('Generated artwork did not pass the transparency or resolution check.');
  const settings = imageRequestSettings(config);
  return {
    artwork: normalized,
    provider: config.openAiKey ? 'openai' : 'local-contour',
    model: config.openAiKey ? settings.model : 'sharp-sobel-v1',
    quality: config.openAiKey ? settings.quality : 'local',
    sourceResolution: await sharp(sanitized).metadata().then(({ width, height }) => `${width}x${height}`),
  };
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
