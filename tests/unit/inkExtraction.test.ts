import { describe, expect, it } from 'vitest';
import { extractInkFromRgba } from '../../src/engine/image-processing';

function makePhoto(w: number, h: number) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      // uneven lighting: left side darker (shadow), slight warm paper, sensor noise
      const light = 0.78 + 0.22 * (x / w);
      const n = (rnd() - 0.5) * 6;
      rgba[p] = 250 * light + n;
      rgba[p + 1] = 245 * light + n;
      rgba[p + 2] = 235 * light + n;
      rgba[p + 3] = 255;
    }
  }
  return rgba;
}

function paintInk(
  rgba: Uint8ClampedArray,
  w: number,
  x: number,
  y: number,
  cover: number,
  ink: [number, number, number],
) {
  const p = (y * w + x) * 4;
  for (let c = 0; c < 3; c++) {
    rgba[p + c] = rgba[p + c]! * (1 - cover) + ink[c]! * cover * ((rgba[p + c]! / 250));
  }
}

describe('extractInkFromRgba', () => {
  const w = 200;
  const h = 120;

  it('removes uneven paper completely and keeps ink colour with smooth edges', () => {
    const rgba = makePhoto(w, h);
    const ink: [number, number, number] = [20, 40, 190];
    // thick stroke rows 50..57, with anti-aliased rows at 49 and 58
    for (let x = 40; x < 160; x++) {
      for (let y = 50; y <= 57; y++) paintInk(rgba, w, x, y, 1, ink);
      paintInk(rgba, w, x, 49, 0.4, ink);
      paintInk(rgba, w, x, 58, 0.4, ink);
    }
    const res = extractInkFromRgba(rgba, w, h, { cropPaddingPx: 0 });

    // tight crop around the stroke including anti-aliased rows
    expect(res.width).toBe(120);
    expect(res.height).toBe(10);

    let paperAlpha = 0;
    // core pixel: opaque and blue
    const core = (4 * res.width + 60) * 4;
    expect(res.rgba[core + 3]).toBeGreaterThan(225);
    expect(res.rgba[core + 2]!).toBeGreaterThan(res.rgba[core]! + 100);

    // anti-aliased edge: partial alpha near the real coverage (0.4)
    const edge = (0 * res.width + 60) * 4;
    const edgeAlpha = res.rgba[edge + 3]! / 255;
    expect(edgeAlpha).toBeGreaterThan(0.25);
    expect(edgeAlpha).toBeLessThan(0.6);
    paperAlpha += 0;
    expect(paperAlpha).toBe(0);
  });

  it('does not leave paper noise or isolated specks', () => {
    const rgba = makePhoto(w, h);
    const ink: [number, number, number] = [10, 10, 10];
    for (let x = 30; x < 170; x++) for (let y = 60; y < 64; y++) paintInk(rgba, w, x, y, 1, ink);
    // a lone dust pixel
    paintInk(rgba, w, 5, 5, 0.6, ink);
    const res = extractInkFromRgba(rgba, w, h, { cropPaddingPx: 0 });
    expect(res.width).toBe(140);
    expect(res.height).toBe(4);
    let opaque = 0;
    for (let i = 3; i < res.rgba.length; i += 4) if (res.rgba[i]! > 0) opaque++;
    expect(opaque).toBe(140 * 4);
  });

  it('returns the image untouched when there is no ink', () => {
    const rgba = makePhoto(w, h);
    const res = extractInkFromRgba(rgba, w, h);
    expect(res.removedPixels).toBe(0);
    expect(res.width).toBe(w);
  });
});
