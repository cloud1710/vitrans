// The vendored Noto faces (web/pdf/fonts): every Vietnamese letter and the Greek letters of medical text are there,
// and the glyph offsets are short (head.indexToLocFormat 0): fontkit 1.1.1, which pdf-lib subsets with, writes
// broken glyphs for fonts with long offsets (seen: Noto Serif drawn as a few stray letters).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PDF_DIR, nodeLibs } from "./node_libs.mjs";

const FONTS = join(PDF_DIR, "fonts");
const faces = readdirSync(FONTS).filter((f) => f.endsWith(".ttf"));

function table(bytes, tag) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = v.getUint16(4);
  for (let i = 0; i < n; i++) {
    const at = 12 + 16 * i;
    if (String.fromCharCode(...bytes.subarray(at, at + 4)) === tag) return { v, offset: v.getUint32(at + 8) };
  }
  return null;
}

test("eight faces: Noto Sans and Noto Serif, regular / bold / italic / bold italic", () => {
  assert.deepEqual(faces.sort(), ["NotoSans-Bold.ttf", "NotoSans-BoldItalic.ttf", "NotoSans-Italic.ttf",
    "NotoSans-Regular.ttf", "NotoSerif-Bold.ttf", "NotoSerif-BoldItalic.ttf", "NotoSerif-Italic.ttf",
    "NotoSerif-Regular.ttf"]);
});

test("every face has short glyph offsets (fontkit subsets those correctly)", () => {
  for (const f of faces) {
    const t = table(new Uint8Array(readFileSync(join(FONTS, f))), "head");
    assert.equal(t.v.getInt16(t.offset + 50), 0, f + " has long offsets");
  }
});

test("every face covers Vietnamese and the Greek letters of medical text", async () => {
  const { fontkit } = await nodeLibs();
  const needed = "ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ"
    + "ỲÝỶỸỴαβγδκλμ±×°–—‘’“”•…";
  for (const f of faces) {
    const font = fontkit.create(readFileSync(join(FONTS, f)));
    const missing = Array.from(needed).filter((ch) => !font.hasGlyphForCodePoint(ch.codePointAt(0)));
    assert.deepEqual(missing, [], f);
  }
});
