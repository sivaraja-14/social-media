import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const nm = (p) => path.join(root, 'node_modules', p);

// Each weight is registered under its own family alias so face matching is exact.
GlobalFonts.registerFromPath(
  nm('@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf'),
  'Playfair Display Bold'
);
GlobalFonts.registerFromPath(
  nm('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  'Inter Regular'
);
GlobalFonts.registerFromPath(
  nm('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  'Inter Medium'
);
GlobalFonts.registerFromPath(
  nm('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
  'Inter SemiBold'
);
GlobalFonts.registerFromPath(
  nm('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
  'Inter Bold'
);

// Cohesive but varied palettes so the feed looks designed, not repetitive.
const PALETTES = [
  { id: 'ink', bg: ['#0b0f14', '#161d26'], text: '#f4f1ea', dim: '#a7b0bc', accent: '#e0b25e' },
  { id: 'slate', bg: ['#101418', '#242c33'], text: '#f2efe8', dim: '#9aa4ae', accent: '#7dd3c0' },
  { id: 'navy', bg: ['#0a1020', '#1b2a4a'], text: '#eef1f8', dim: '#9fa9bd', accent: '#8ab4ff' },
  { id: 'forest', bg: ['#0b1712', '#1e3a2c'], text: '#eff4ee', dim: '#a2b3a8', accent: '#e4c07a' },
  { id: 'plum', bg: ['#150d1c', '#33203f'], text: '#f5eff6', dim: '#ada0b6', accent: '#e0a3d0' },
  { id: 'paper', bg: ['#f7f2e9', '#ece3d4'], text: '#23201b', dim: '#6d675d', accent: '#b4713a' }
];

const QUOTE_FONT = '"Playfair Display Bold", serif';
const UI_MED = '"Inter Medium", sans-serif';
const UI_SEMI = '"Inter SemiBold", sans-serif';
const UI_BOLD = '"Inter Bold", sans-serif';

const W = 1080;
const H = 1350;

export function pickPalette(seed) {
  const idx = Math.abs(seed) % PALETTES.length;
  return PALETTES[idx];
}

function hexToRgba(hex, alpha) {
  const v = hex.replace('#', '');
  const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitQuote(ctx, text, maxWidth, maxHeight, startSize) {
  for (let size = startSize; size >= 44; size -= 2) {
    ctx.font = `${size}px ${QUOTE_FONT}`;
    const lines = wrapLines(ctx, text, maxWidth);
    const lineHeight = Math.round(size * 1.24);
    if (lines.length * lineHeight <= maxHeight) return { size, lines, lineHeight };
  }
  ctx.font = `44px ${QUOTE_FONT}`;
  return { size: 44, lines: wrapLines(ctx, text, maxWidth), lineHeight: 56 };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function renderPost({ quote, handle, brandName, dayNumber, dateLabel, paletteIndex }) {
  const palette = PALETTES[paletteIndex % PALETTES.length];
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, W * 0.6, H);
  grad.addColorStop(0, palette.bg[0]);
  grad.addColorStop(1, palette.bg[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Soft accent glow, top-right
  const glow = ctx.createRadialGradient(W - 120, 140, 20, W - 120, 140, 620);
  glow.addColorStop(0, hexToRgba(palette.accent, 0.28));
  glow.addColorStop(1, hexToRgba(palette.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Soft glow, bottom-left
  const glow2 = ctx.createRadialGradient(60, H - 160, 20, 60, H - 160, 560);
  glow2.addColorStop(0, hexToRgba(palette.accent, 0.16));
  glow2.addColorStop(1, hexToRgba(palette.accent, 0));
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // Inner hairline frame
  ctx.strokeStyle = hexToRgba(palette.accent, 0.35);
  ctx.lineWidth = 2;
  roundRect(ctx, 48, 48, W - 96, H - 96, 28);
  ctx.stroke();

  // Top label
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `26px ${UI_BOLD}`;
  const label = quote.theme;
  const spacing = 10;
  const labelWidth =
    ctx.measureText(label).width + spacing * (label.length - 1);
  let x = W / 2 - labelWidth / 2;
  ctx.fillStyle = palette.accent;
  for (const ch of label) {
    ctx.fillText(ch, x + ctx.measureText(ch).width / 2, 168);
    x += ctx.measureText(ch).width + spacing;
  }

  // Divider under the label
  ctx.fillStyle = hexToRgba(palette.accent, 0.5);
  ctx.fillRect(W / 2 - 40, 200, 80, 3);

  // Giant translucent quotation mark behind the text
  ctx.font = `420px ${QUOTE_FONT}`;
  ctx.fillStyle = hexToRgba(palette.accent, 0.1);
  ctx.textAlign = 'center';
  ctx.fillText('\u201C', W / 2, 700);

  // Quote text, auto-fitted
  const { size, lines, lineHeight } = fitQuote(ctx, quote.text, W - 260, 640, 84);
  ctx.font = `${size}px ${QUOTE_FONT}`;
  ctx.fillStyle = palette.text;
  const startY = H / 2 - ((lines.length - 1) * lineHeight) / 2 + 20;
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, startY + i * lineHeight);
  });

  // Bottom block
  const footerY = H - 190;
  ctx.fillStyle = hexToRgba(palette.accent, 0.6);
  ctx.fillRect(W / 2 - 46, footerY, 92, 3);

  ctx.font = `42px ${UI_SEMI}`;
  ctx.fillStyle = palette.text;
  ctx.fillText(`@${handle}`, W / 2, footerY + 78);

  ctx.font = `26px ${UI_MED}`;
  ctx.fillStyle = palette.dim;
  ctx.fillText(`${brandName}  ·  Daily #${dayNumber}  ·  ${dateLabel}`, W / 2, footerY + 132);

  return canvas;
}

export async function renderToFile({ outFile, ...opts }) {
  const canvas = renderPost(opts);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  // Instagram's /{ig-user-id}/media endpoint accepts JPEG only (max 8 MB).
  fs.writeFileSync(outFile, await canvas.encode('jpeg', 92));
  return outFile;
}
