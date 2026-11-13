// Source of the app icon set (apps/mobile/assets). Not part of the build: run it from a scratch folder
// with `bun add sharp`, then `bun render-icons.ts <outDir>` and copy the PNGs (preview.png lands beside outDir).
import sharp from 'sharp';

const out = process.argv[2] ?? './out';
const C1 = '#16278F';
const C2 = '#3D6DF2';

// The mark in a 1024 box, centred on (512, 512): a wave that rises into an arrow (flow → future),
// with a softer wave beneath it.
const mark = (color: string, soft: number) => `
  <g transform="translate(-8 -18)" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="78">
    <path d="M250 650 C 380 650, 420 470, 560 470 S 700 380, 760 300" />
    <path d="M594 339 L760 300 L769 470" />
    <path d="M250 800 C 380 800, 430 640, 570 640 S 700 590, 770 560" stroke-opacity="${soft}" />
  </g>`;

const gradient = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C1}" />
      <stop offset="1" stop-color="${C2}" />
    </linearGradient>
  </defs>`;

const scaled = (inner: string, scale: number) =>
  `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${inner}</g>`;

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${body}</svg>`;

const files: Array<[string, string, number]> = [
  // Full-bleed launcher icon (Android masks the shape itself).
  [
    'icon.png',
    svg(
      `${gradient}<rect width="1024" height="1024" fill="url(#bg)"/>${scaled(mark('#FFFFFF', 0.45), 0.92)}`,
    ),
    1024,
  ],
  // Adaptive icon layers: only the inner ~61% is always visible, so the mark is smaller.
  [
    'android-icon-background.png',
    svg(`${gradient}<rect width="1024" height="1024" fill="url(#bg)"/>`),
    512,
  ],
  ['android-icon-foreground.png', svg(scaled(mark('#FFFFFF', 0.45), 0.72)), 512],
  // Themed icons use only the alpha channel; the soft wave stays visible but lighter.
  ['android-icon-monochrome.png', svg(scaled(mark('#FFFFFF', 0.5), 0.72)), 432],
  ['splash-icon.png', svg(scaled(mark('#FFFFFF', 0.45), 0.9)), 1024],
  [
    'favicon.png',
    svg(
      `${gradient}<rect width="1024" height="1024" rx="224" fill="url(#bg)"/>${scaled(mark('#FFFFFF', 0.45), 0.98)}`,
    ),
    48,
  ],
];

for (const [name, source, size] of files) {
  await sharp(Buffer.from(source), { density: 72 * (size / 1024) * 4 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(`${out}/${name}`);
  console.log(name, size);
}

// A preview sheet: the adaptive icon as a circle and a squircle, the themed icon, and the favicon.
const fg = await sharp(
  Buffer.from(
    svg(
      `${gradient}<rect width="1024" height="1024" fill="url(#bg)"/>${scaled(mark('#FFFFFF', 0.45), 0.72)}`,
    ),
  ),
)
  .resize(512, 512)
  .png()
  .toBuffer();
const circle = await sharp(fg)
  .composite([
    {
      input: Buffer.from(
        '<svg width="512" height="512"><circle cx="256" cy="256" r="172" fill="#fff"/></svg>',
      ),
      blend: 'dest-in',
    },
  ])
  .png()
  .toBuffer()
  .then((b) => sharp(b).extract({ left: 84, top: 84, width: 344, height: 344 }).png().toBuffer());
const squircle = await sharp(fg)
  .composite([
    {
      input: Buffer.from(
        '<svg width="512" height="512"><rect x="84" y="84" width="344" height="344" rx="90" fill="#fff"/></svg>',
      ),
      blend: 'dest-in',
    },
  ])
  .png()
  .toBuffer()
  .then((b) => sharp(b).extract({ left: 84, top: 84, width: 344, height: 344 }).png().toBuffer());
const mono = await sharp(
  Buffer.from(
    svg(`<rect width="1024" height="1024" fill="#DDE3F0"/>${scaled(mark('#24304F', 0.5), 0.72)}`),
  ),
)
  .resize(512, 512)
  .png()
  .toBuffer()
  .then((b) => sharp(b).extract({ left: 84, top: 84, width: 344, height: 344 }).png().toBuffer());
await sharp({ create: { width: 1500, height: 420, channels: 4, background: '#F7F6F2' } })
  .composite([
    { input: circle, left: 30, top: 38 },
    { input: squircle, left: 400, top: 38 },
    { input: mono, left: 770, top: 38 },
    {
      input: await sharp(`${out}/favicon.png`).resize(96, 96, { kernel: 'nearest' }).toBuffer(),
      left: 1160,
      top: 80,
    },
    { input: `${out}/favicon.png`, left: 1300, top: 104 },
  ])
  .png()
  .toFile(`${out}/../preview.png`);
console.log('preview.png');
