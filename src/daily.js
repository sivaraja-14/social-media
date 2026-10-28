#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { renderToFile, pickPalette } from './render.js';
import { publishPhoto, verifyAccess } from './instagram.js';

const root = config.root;
const OUTPUT_DIR = path.join(root, 'output');
const QUOTES_FILE = path.join(root, 'content', 'quotes.json');
const HISTORY_FILE = path.join(root, 'content', 'history.json');

const HISTORY_LIMIT = 40;

// ---------- CLI args ----------
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const dateArg = args.find((a) => a.startsWith('--date='));

const opts = {
  publish: flags.has('--publish'),
  skipGenerate: flags.has('--skip-generate'),
  check: flags.has('--check'),
  date: dateArg ? dateArg.split('=')[1] : new Date().toISOString().slice(0, 10)
};

// ---------- helpers ----------
const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
};

function dayNumber(dateStr) {
  return Math.floor(Date.parse(`${dateStr}T00:00:00Z`) / 86_400_000);
}

// Deterministic PRNG so every machine picks the same quote for the same day.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CTAS = [
  'Save this for the day you need it most.',
  'Send this to someone who needs the reminder.',
  'Follow for one of these every single day.',
  'Which line hit you today? Tell us below.',
  'Read it twice. Then go do the hard thing.'
];

const BASE_TAGS = [
  'motivation',
  'motivationalquotes',
  'mindset',
  'selfimprovement',
  'discipline',
  'dailyquote',
  'quotes',
  'growthmindset',
  'successmindset',
  'personaldevelopment'
];

function selectQuote(dateStr) {
  const quotes = readJson(QUOTES_FILE, []);
  if (!quotes.length) throw new Error('content/quotes.json is empty.');
  const history = readJson(HISTORY_FILE, { usedIds: [] });

  let used = history.usedIds || [];
  let candidates = quotes.filter((q) => !used.includes(q.id));
  if (candidates.length === 0) {
    // Ran through the whole library: reset, but keep the last few so we don't repeat immediately.
    used = used.slice(-Math.max(3, Math.floor(quotes.length / 4)));
    candidates = quotes.filter((q) => !used.includes(q.id));
    if (candidates.length === 0) candidates = quotes;
  }

  const rnd = mulberry32(dayNumber(dateStr));
  const quote = candidates[Math.floor(rnd() * candidates.length)];
  return { quote, history, usedIds: [...used, quote.id].slice(-HISTORY_LIMIT) };
}

function buildCaption(quote, dayNum) {
  const cta = CTAS[dayNum % CTAS.length];
  const themeTag = quote.theme.toLowerCase().replace(/[^a-z0-9]/g, '');
  const tags = [...new Set([...BASE_TAGS, themeTag, config.brandHandle.replace(/[^a-z0-9]/g, '')])]
    .map((t) => `#${t}`)
    .join(' ');
  return `${quote.text}\n\n${cta}\n\n— ${config.brandName} · @${config.brandHandle}\n\n${tags}`;
}

// ---------- steps ----------
async function generate(dateStr) {
  const outFile = path.join(OUTPUT_DIR, `${dateStr}.jpg`);
  const metaFile = path.join(OUTPUT_DIR, `${dateStr}.json`);

  if (fs.existsSync(outFile) && fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    console.log(`✓ Reusing existing post for ${dateStr}: ${outFile}`);
    return meta;
  }

  const dayNum = dayNumber(dateStr);
  const { quote, usedIds } = selectQuote(dateStr);
  const paletteIndex = dayNum % 6;
  const palette = pickPalette(paletteIndex);
  const dateLabel = new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });

  await renderToFile({
    outFile,
    quote,
    handle: config.brandHandle,
    brandName: config.brandName,
    dayNumber: dayNum,
    dateLabel,
    paletteIndex
  });

  const meta = {
    date: dateStr,
    dayNumber: dayNum,
    quote,
    palette: palette.id,
    file: path.relative(root, outFile),
    caption: buildCaption(quote, dayNum),
    createdAt: new Date().toISOString()
  };

  writeJson(metaFile, meta);
  writeJson(HISTORY_FILE, { usedIds });
  console.log(`✓ Generated ${meta.file}  [${quote.theme}] "${quote.text}"`);
  return meta;
}

async function urlIsReachable(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}

async function publish(meta) {
  if (!config.imageUrlBase) {
    throw new Error(
      'IMAGE_BASE_URL is not set. It must point at a public folder that contains output/*.jpg ' +
        '(see README section "Host the image somewhere public").'
    );
  }
  const url = `${config.imageUrlBase.replace(/\/$/, '')}/${meta.date}.jpg`;
  console.log(`→ Publishing to Instagram: ${url}`);

  if (!(await urlIsReachable(url))) {
    throw new Error(
      `The post image is not publicly reachable at ${url}. ` +
        'IMAGE_BASE_URL must point at a public folder that contains output/*.jpg ' +
        '(for example a raw.githubusercontent.com URL of the output directory after the workflow commits it).'
    );
  }

  const result = await publishPhoto({ imageUrl: url, caption: meta.caption });

  meta.published = { at: new Date().toISOString(), imageUrl: url, ...result };
  writeJson(path.join(OUTPUT_DIR, `${meta.date}.json`), meta);
  console.log(`✓ Published. publishId=${result.publishId}`);
  return result;
}

// ---------- main ----------
async function main() {
  if (opts.check) {
    const info = await verifyAccess();
    console.log(`✓ Connected to @${info.username} (id ${info.id}, ${info.media_count} posts)`);
    return;
  }

  if (opts.skipGenerate && !opts.publish) {
    throw new Error('--skip-generate only makes sense together with --publish');
  }

  const meta = opts.skipGenerate
    ? readJson(path.join(OUTPUT_DIR, `${opts.date}.json`), null)
    : await generate(opts.date);

  if (!meta) throw new Error(`No generated post found for ${opts.date}. Run without --skip-generate first.`);

  if (opts.publish) {
    if (meta.published?.publishId) {
      console.log(`✓ ${opts.date} was already published at ${meta.published.at}. Nothing to do.`);
      return;
    }
    await publish(meta);
  } else {
    console.log('  Caption preview:\n' + meta.caption.split('\n').map((l) => '    ' + l).join('\n'));
    console.log(`\nRun "npm run post" to publish it to Instagram.`);
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
