// Generate the app icon from code, the way the whole newsroom is drawn.
//
// A 32x32 pixel grid scaled up with hard edges, so it stays crisp at every size an OS asks
// for. This is a PLACEHOLDER: it exists so a release never ships the default Electron logo.
// Replace `ICON` below (or drop a real build/icon.png in) when there's proper artwork.
//
//   node scripts/make-icon.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png');
const SIZE = 512;
const GRID = 32;
const SCALE = SIZE / GRID;

// The app's own palette: noir ground, newsprint, amber masthead rule, red ink.
const C = {
  ' ': null, // transparent
  k: [0x12, 0x16, 0x1c, 255], // ground
  d: [0x0a, 0x0d, 0x12, 255], // shadow
  p: [0xe8, 0xe2, 0xd0, 255], // newsprint
  h: [0xf7, 0xf1, 0xe2, 255], // highlight
  g: [0xb9, 0xb3, 0x9c, 255], // column rules
  a: [0xe8, 0xb0, 0x4b, 255], // amber
  r: [0x8a, 0x2f, 0x22, 255], // red ink
};

// A folded paper on a dark ground: amber masthead rule, a red kicker, column rules.
const ICON = [
  '                                ',
  '                                ',
  '   kkkkkkkkkkkkkkkkkkkkkkkkkk   ',
  '  kkkkkkkkkkkkkkkkkkkkkkkkkkkk  ',
  '  kkddddddddddddddddddddddddkk  ',
  '  kkdppppppppppppppppppppppdkk  ',
  '  kkdphhhhhhhhhhhhhhhhhhhhpdkk  ',
  '  kkdphaaaaaaaaaaaaaaaaaahpdkk  ',
  '  kkdphaaaaaaaaaaaaaaaaaahpdkk  ',
  '  kkdphhhhhhhhhhhhhhhhhhhhpdkk  ',
  '  kkdppppppppppppppppppppppdkk  ',
  '  kkdpprrrrrrrrrrrrrrrrrrppdkk  ',
  '  kkdppppppppppppppppppppppdkk  ',
  '  kkdppgggggggppppgggggggppdkk  ',
  '  kkdppgggggggppppgggggggppdkk  ',
  '  kkdppppppppppppppppppppppdkk  ',
  '  kkdppgggggggppppgggggggppdkk  ',
  '  kkdppgggggggppppgggggggppdkk  ',
  '  kkdppgggggggppppgggggggppdkk  ',
  '  kkdppppppppppppppppppppppdkk  ',
  '  kkdppgggggggppppgggggggppdkk  ',
  '  kkdppgggggggppppgggggggppdkk  ',
  '  kkdppppppppppppppppppppppdkk  ',
  '  kkdppgggggggppppgggggggppdkk  ',
  '  kkdppgggggggppppgggggggppdkk  ',
  '  kkdppppppppppppppppppppppdkk  ',
  '  kkddddddddddddddddddddddddkk  ',
  '  kkkkkkkkkkkkkkkkkkkkkkkkkkkk  ',
  '   kkkkkkkkkkkkkkkkkkkkkkkkkk   ',
  '                                ',
  '                                ',
  '                                ',
];

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// RGBA rows, each prefixed with a filter byte of 0 (none).
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let at = 0;
for (let y = 0; y < SIZE; y++) {
  raw[at++] = 0;
  const row = ICON[Math.floor(y / SCALE)] ?? '';
  for (let x = 0; x < SIZE; x++) {
    const px = C[row[Math.floor(x / SCALE)] ?? ' '] ?? [0, 0, 0, 0];
    raw[at++] = px[0];
    raw[at++] = px[1];
    raw[at++] = px[2];
    raw[at++] = px[3];
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // truecolour with alpha
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log(`Wrote ${OUT} (${SIZE}x${SIZE}, ${png.length} bytes)`);
