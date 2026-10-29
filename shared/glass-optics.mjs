// Adapted from shayann07/liquidglass's Apache-2.0 material.sksl (2026 Shayan).
// Local changes: CPU geometry maps for SVG, CSS superellipse matching, fixed light.
// See licenses/liquidglass-NOTICE.txt and docs/liquid-glass-material.md.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = v => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };

function bevelSlope(depth) {
  const u = 1 - clamp(depth, .002, .998), power = 4;
  return u ** (power - 1) / Math.max(1 - u ** power, 1e-4) ** (1 - 1 / power);
}
function snellShift(slope) {
  const ci = 1 / Math.hypot(1, slope), si = slope * ci, st = si / 1.5;
  const ct = Math.sqrt(1 - st * st);
  return (si * ct - ci * st) / Math.max(ci * ct + si * st, 1e-4);
}
const rimShift = snellShift(bevelSlope(0));

/** Coordinates and distances are CSS pixels; exponent matches CSS 2 ** corner-shape. */
export function glassSample(x, y, width, height, radius, power = 2 ** 1.5) {
  const r = Math.min(radius, width / 2, height / 2);
  const px = x - width / 2, py = y - height / 2;
  const qx = Math.abs(px) - width / 2 + r, qy = Math.abs(py) - height / 2 + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  const norm = (ox ** power + oy ** power) ** (1 / power);
  let gx = qx > qy ? 1 : 0, gy = 1 - gx, gradient = 1;
  if (qx > 0 && qy > 0) {
    gx = (ox / norm) ** (power - 1); gy = (oy / norm) ** (power - 1);
    gradient = Math.hypot(gx, gy); gx /= gradient; gy /= gradient;
  }
  const distance = (norm + Math.min(Math.max(qx, qy), 0) - r) / gradient;
  const depth = Math.max(0, -distance), nx = Math.sign(px) * gx, ny = Math.sign(py) * gy;
  const band = Math.min(24, height * .24, width * .24), e = depth / band;
  if(e>=1)return {distance,dx:0,dy:0,light:0};
  const slope = bevelSlope(e);
  const bend = snellShift(slope) / rimShift;
  const facing = nx * -.6 + ny * -.8;
  const bevel = (1 - smooth(depth / 3.2));
  const key = Math.max(facing, 0) ** 3, counter = Math.max(-facing, 0) ** 4 * .55;
  const fresnel = .04 + .96 * (1 - 1 / Math.hypot(1, slope)) ** 5;
  const light = (key + counter) * bevel * .64 + fresnel * bevel * .12;
  const shadow = (1 - Math.abs(facing)) * (1 - smooth(depth / 1.4)) * .22
    + smooth(depth / 2) * (1 - smooth(depth / 7)) * .065;
  return {distance, dx: -nx * bend, dy: -ny * bend, light: light - shadow};
}
