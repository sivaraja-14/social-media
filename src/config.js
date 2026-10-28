import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Minimal .env loader (no dependency). Real env vars always win.
const envPath = path.join(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

export const config = {
  brandName: process.env.BRAND_NAME || 'Daily Momentum',
  brandHandle: process.env.BRAND_HANDLE || 'daily.momentum',
  igUserId: process.env.IG_USER_ID || '',
  igAccessToken: process.env.IG_ACCESS_TOKEN || '',
  igGraphVersion: process.env.IG_GRAPH_VERSION || 'v26.0',
  // Public base URL that serves the contents of the output/ folder,
  // e.g. https://raw.githubusercontent.com/USER/REPO/main/output
  imageUrlBase: process.env.IMAGE_BASE_URL || '',
  root
};
