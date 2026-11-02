import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assetOrigin } from './asset-origin.mjs';

const origin = assetOrigin();
if (origin) {
  console.log(`Using published anatomy assets at ${origin}; source generation is a separate release step.`);
} else {
  const result = spawnSync('python', [fileURLToPath(new URL('../../../infra/anatomy/prepare.py', import.meta.url))], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
