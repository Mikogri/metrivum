import { appendFileSync, copyFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { assetOrigin } from './asset-origin.mjs';

const root = resolve(import.meta.dirname, '../build/client');
// A top-level 404 disables Pages' implicit catch-all SPA handling for missing assets.
copyFileSync(join(root, '404/index.html'), join(root, '404.html'));
copyFileSync(resolve(import.meta.dirname, '../public/_redirects'), join(root, '_redirects'));
const origin = assetOrigin();
if (origin) {
  // Only generated output is removed; upload the matching source public folders to R2 first.
  for (const directory of ['anatomy', 'downloads']) {
    appendFileSync(join(root, '_redirects'), `\n/${directory}/* ${origin}/${directory}/:splat 302\n`);
    rmSync(join(root, directory), { recursive: true, force: true });
  }
}
function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) check(path);
    else if (statSync(path).size > 25 * 1024 * 1024)
      throw new Error(`Cloudflare Pages file exceeds 25 MiB; serve large downloads from object storage: ${path}`);
  }
}
check(root);
console.log('Pages routing, 404 and individual file sizes prepared.');
