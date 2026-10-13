import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DESIGN_ID = /^[a-f0-9-]{36}$/;

export function assertDesignId(value) {
  if (!DESIGN_ID.test(String(value))) throw new Error('Invalid design ID.');
  return String(value);
}

export function createStorage(root) {
  const designPath = (id) => join(root, 'designs', assertDesignId(id));
  const manifestPath = (id) => join(designPath(id), 'manifest.json');

  return {
    root,
    designPath,
    assetPath(id, asset) {
      const names = { preview: 'artwork.png', print: 'print.png' };
      if (!names[asset]) throw new Error('Invalid asset.');
      return join(designPath(id), names[asset]);
    },
    async init() {
      await mkdir(join(root, 'designs'), { recursive: true, mode: 0o700 });
    },
    async create(id, manifest, artwork) {
      await mkdir(designPath(id), { recursive: false, mode: 0o700 });
      await writeFile(join(designPath(id), 'artwork.png'), artwork, { mode: 0o600 });
      await writeFile(manifestPath(id), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    },
    async read(id) {
      return JSON.parse(await readFile(manifestPath(id), 'utf8'));
    },
    async update(id, patch) {
      const next = { ...(await this.read(id)), ...patch, updatedAt: new Date().toISOString() };
      await writeFile(manifestPath(id), JSON.stringify(next, null, 2), { mode: 0o600 });
      return next;
    },
    async writePrint(id, buffer) {
      await writeFile(join(designPath(id), 'print.png'), buffer, { mode: 0o600 });
    },
    async delete(id) {
      await rm(designPath(id), { recursive: true, force: true });
    },
    async cleanup(now = Date.now()) {
      const base = join(root, 'designs');
      const ids = await readdir(base).catch(() => []);
      let removed = 0;
      for (const id of ids) {
        try {
          const manifest = await this.read(id);
          if (Date.parse(manifest.expiresAt) <= now) {
            await this.delete(id);
            removed += 1;
          }
        } catch {
          // Corrupt entries are left for manual inspection instead of deleting blindly.
        }
      }
      return removed;
    },
    async deleteWhere(predicate) {
      const base = join(root, 'designs');
      const ids = await readdir(base).catch(() => []);
      let removed = 0;
      for (const id of ids) {
        try {
          const manifest = await this.read(id);
          if (predicate(manifest)) {
            await this.delete(id);
            removed += 1;
          }
        } catch {
          // Invalid entries are never deleted by a broad privacy selector.
        }
      }
      return removed;
    },
  };
}
