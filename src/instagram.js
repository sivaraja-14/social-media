import { config } from './config.js';

const BASE = () => `https://graph.facebook.com/${config.igGraphVersion}`;

async function ig(pathname, params, method = 'GET') {
  const url = new URL(`${BASE()}${pathname}`);
  let body;
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else {
    body = new URLSearchParams(params);
  }
  const res = await fetch(url, {
    method,
    body: method === 'GET' ? undefined : body,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const err = json.error || {};
    throw new Error(
      `Instagram API ${method} ${pathname} failed (${res.status}): ${err.message || 'unknown error'}` +
        (err.code ? ` [code ${err.code}]` : '')
    );
  }
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function requireConfig() {
  const missing = [];
  if (!config.igUserId) missing.push('IG_USER_ID');
  if (!config.igAccessToken) missing.push('IG_ACCESS_TOKEN');
  if (!config.imageUrlBase) missing.push('IMAGE_BASE_URL');
  if (missing.length) {
    throw new Error(
      `Missing Instagram configuration: ${missing.join(', ')}. Set them in .env or in your CI secrets. ` +
        'See README.md for how to obtain them.'
    );
  }
}

/**
 * Publishes a photo post to Instagram using the Graph API:
 * create media container -> poll for processing -> publish.
 * Returns { creationId, publishId }.
 */
export async function publishPhoto({ imageUrl, caption }) {
  requireConfig();

  const created = await ig(`/${config.igUserId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: config.igAccessToken
  }, 'POST');

  const creationId = created.id;
  const deadline = Date.now() + 120_000;
  let status = 'IN_PROGRESS';
  while (Date.now() < deadline) {
    const info = await ig(`/${creationId}`, {
      fields: 'status_code',
      access_token: config.igAccessToken
    });
    status = info.status_code;
    if (status === 'FINISHED') break;
    if (status === 'ERROR') {
      throw new Error(`Instagram could not process the image at ${imageUrl}. Check that IMAGE_BASE_URL is publicly reachable.`);
    }
    await sleep(3000);
  }
  if (status !== 'FINISHED') {
    throw new Error(`Timed out waiting for Instagram to process the container (${creationId}).`);
  }

  const published = await ig(`/${config.igUserId}/media_publish`, {
    creation_id: creationId,
    access_token: config.igAccessToken
  }, 'POST');

  return { creationId, publishId: published.id };
}

/** Verifies the token can see the configured IG account. */
export async function verifyAccess() {
  requireConfig();
  return ig(`/${config.igUserId}`, {
    fields: 'id,username,media_count',
    access_token: config.igAccessToken
  });
}
