// Photo helpers of the image tool (web/anh/image.js): EXIF orientation and the JPEG's stored size (to turn the
// picture when a browser did not), the working size (long side <= 2048, never enlarged), and the colours of the
// overlay (median background, a text colour that stands out from it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { exifOrientation, jpegSize, scaledSize, browserMissedTurn, medianColor, contrastRatio, textColor }
  from "../image.js";

// a minimal JPEG: SOI, an APP1 Exif segment with IFD0 = [orientation], SOF0 w x h, EOI
function jpeg({ orientation, w, h, big }) {
  const u16 = (v) => (big ? [v >> 8, v & 255] : [v & 255, v >> 8]);
  const u32 = (v) => (big ? [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255] : [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24]);
  const tiff = [...(big ? [0x4d, 0x4d] : [0x49, 0x49]), ...u16(42), ...u32(8), ...u16(1),
    ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const seg = (marker, body) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
  const sof = [8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const parts = [0xff, 0xd8];
  if (orientation) parts.push(...seg(0xe1, app1));
  parts.push(...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0]), ...seg(0xc0, sof), 0xff, 0xd9);
  return new Uint8Array(parts);
}

test("EXIF orientation in little- and big-endian files; 1 when there is none or it is not a JPEG", () => {
  assert.equal(exifOrientation(jpeg({ orientation: 6, w: 4000, h: 3000 })), 6);
  assert.equal(exifOrientation(jpeg({ orientation: 8, w: 4000, h: 3000, big: true })), 8);
  assert.equal(exifOrientation(jpeg({ w: 40, h: 30 })), 1);
  assert.equal(exifOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 1);
  assert.equal(exifOrientation(new Uint8Array([0xff, 0xd8, 0xff])), 1);  // cut short: no throw
});

test("the JPEG's stored size from its frame header", () => {
  assert.deepEqual(jpegSize(jpeg({ orientation: 6, w: 4000, h: 3000 })), { w: 4000, h: 3000 });
  assert.equal(jpegSize(new Uint8Array([1, 2, 3])), null);
});

test("a browser that decoded a turned photo (5-8) without turning it is caught by the size", () => {
  assert.equal(browserMissedTurn(6, 4000, 3000, { w: 4000, h: 3000 }), true);
  assert.equal(browserMissedTurn(6, 3000, 4000, { w: 4000, h: 3000 }), false);
  assert.equal(browserMissedTurn(1, 4000, 3000, { w: 4000, h: 3000 }), false);
  assert.equal(browserMissedTurn(6, 3000, 3000, { w: 3000, h: 3000 }), false);  // square: cannot tell
  assert.equal(browserMissedTurn(6, 4000, 3000, null), false);
});

test("working size: the long side at most 2048, never enlarged", () => {
  assert.deepEqual(scaledSize(4032, 3024, 2048), { w: 2048, h: 1536 });
  assert.deepEqual(scaledSize(3024, 4032, 2048), { w: 1536, h: 2048 });
  assert.deepEqual(scaledSize(800, 600, 2048), { w: 800, h: 600 });
});

test("colours: median background, WCAG contrast, a text colour from the box's most different pixels", () => {
  assert.deepEqual(medianColor([[250, 250, 250], [10, 10, 10], [240, 242, 244], [245, 246, 247], [251, 250, 249]]),
    [245, 246, 247]);
  assert.ok(Math.abs(contrastRatio([0, 0, 0], [255, 255, 255]) - 21) < 1e-9);
  // dark-blue text on white: the text colour comes from the pixels far from the background
  const inside = [];
  for (let i = 0; i < 80; i++) inside.push([250, 250, 250]);
  for (let i = 0; i < 20; i++) inside.push([20, 30, 90]);
  assert.deepEqual(textColor([250, 250, 250], inside), [20, 30, 90]);
  // too little contrast in the box (faint text): black or white, whichever stands out from the background
  assert.deepEqual(textColor([200, 200, 200], [[190, 190, 190], [205, 205, 205]]), [0, 0, 0]);
  assert.deepEqual(textColor([30, 40, 60], [[35, 45, 65]]), [255, 255, 255]);
});
