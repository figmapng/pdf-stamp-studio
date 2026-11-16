import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

mkdirSync('public/demo-assets', { recursive: true });
mkdirSync('tools/excel-stamp-addin/assets', { recursive: true });

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const out = new Uint8Array(12 + data.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.byteLength, false);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.byteLength));
  view.setUint32(8 + data.byteLength, crc, false);
  return out;
}

function createPng(width, height, drawFn) {
  const rowStride = 1 + width * 4;
  const raw = new Uint8Array(rowStride * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    raw[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = a;
    }
  }

  const deflated = deflateSync(raw);

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = makePngChunk('IHDR', ihdrData);
  const idatChunk = makePngChunk('IDAT', deflated);
  const iendChunk = makePngChunk('IEND', new Uint8Array(0));

  const total = signature.byteLength + ihdrChunk.byteLength + idatChunk.byteLength + iendChunk.byteLength;
  const png = new Uint8Array(total);
  let pos = 0;
  png.set(signature, pos); pos += signature.byteLength;
  png.set(ihdrChunk, pos); pos += ihdrChunk.byteLength;
  png.set(idatChunk, pos); pos += idatChunk.byteLength;
  png.set(iendChunk, pos);
  return png;
}

// 1. Sig 1 (Zatybek)
const sig1 = createPng(160, 60, (x, y, w, h) => {
  const wave = Math.sin(x / 12) * 12 + h / 2;
  if (Math.abs(y - wave) < 2.5 || (x > 30 && x < 120 && Math.abs(y - (h / 2 - 5)) < 1.5)) {
    return [30, 64, 175, 230];
  }
  return [0, 0, 0, 0];
});

// 2. Sig 2 (Satybaldina)
const sig2 = createPng(160, 60, (x, y, w, h) => {
  const wave = Math.cos(x / 10) * 14 + h / 2;
  if (Math.abs(y - wave) < 2.5 || (x > 40 && x < 130 && Math.abs(y - (h / 2 + 4)) < 1.5)) {
    return [20, 40, 120, 230];
  }
  return [0, 0, 0, 0];
});

// 3. Stamp (Round blue stamp)
const stamp = createPng(120, 120, (x, y, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
  if (dist >= 50 && dist <= 54) {
    return [37, 99, 235, 220];
  }
  if (dist >= 36 && dist <= 38) {
    return [37, 99, 235, 200];
  }
  if (dist < 12) {
    return [37, 99, 235, 180];
  }
  return [0, 0, 0, 0];
});

writeFileSync('public/demo-assets/sig_zatybek.png', sig1);
writeFileSync('tools/excel-stamp-addin/assets/sig_zatybek.png', sig1);

writeFileSync('public/demo-assets/sig_satybaldina.png', sig2);
writeFileSync('tools/excel-stamp-addin/assets/sig_satybaldina.png', sig2);

writeFileSync('public/demo-assets/stamp.png', stamp);
writeFileSync('tools/excel-stamp-addin/assets/stamp.png', stamp);

console.log('✓ Successfully created demo assets in public/demo-assets and tools/excel-stamp-addin/assets');
