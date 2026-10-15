// Synthetic pictures for the /anh/ page runner (tests/page_anh.mjs), drawn in Chrome: an English slide (PNG), a
// Vietnamese slide (PNG), a picture without text (PNG), the camera-like 2048 x 1536 photo of the OCR tests (JPEG),
// the slide stored turned 90 degrees counter-clockwise (JPEG; the runner adds EXIF orientation 6) and a conference
// poster in ALL-CAPS (PNG: gold bold title, centred subtitles, a right-aligned word, a date, a pill). window.__make()
// -> { name: { dataUrl, truth } }. Test infrastructure only.
import { SLIDE, photo } from "../../ocr/tests/synthetic.js";

function canvas(w, h, bg) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg || "#ffffff";
  ctx.fillRect(0, 0, w, h);
  return { c, ctx };
}

function slide(lines, title) {
  const { c, ctx } = canvas(1600, 900);
  ctx.fillStyle = "#1b2a3a";
  ctx.font = "bold 56px Arial, sans-serif";
  ctx.fillText(title, 90, 150);
  ctx.font = "34px Arial, sans-serif";
  lines.forEach((b, i) => {
    const y = 290 + i * 105;
    ctx.beginPath();
    ctx.arc(115, y - 11, 7, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillText(b, 145, y);
  });
  return c;
}

// A conference poster (PNG): a dark blue gradient with a faint noise texture, a gold bold ALL-CAPS title, centred
// subtitles, a right-aligned word, a left-aligned date line and a gold pill-shaped box with a centred location.
// POSTER.lines: [text, font, colour, align, x, baseline y] in drawing order.
export const POSTER = {
  w: 1600, h: 1000,
  lines: [
    ["SINGAPORE", "34px Arial, sans-serif", "#ffffff", "right", 1520, 100],
    ["I AM ATTENDING ASDP 2026", "bold 76px Arial, sans-serif", "#f5c542", "center", 800, 250],
    ["3RD ANNUAL CONGRESS OF ASIAN SOCIETY OF DIGITAL PATHOLOGY", "bold 36px Arial, sans-serif", "#ffffff", "center", 800, 360],
    ["INTELLIGENCE IN EVERY PIXEL: POWERING NEXT GENERATION PATHOLOGY", "30px Arial, sans-serif", "#9cc8ff", "center", 800, 450],
    ["1-3 NOVEMBER 2026", "bold 44px Arial, sans-serif", "#ffffff", "left", 120, 600],
    ["ACADEMIA, SINGAPORE GENERAL HOSPITAL", "bold 32px Arial, sans-serif", "#0a1a3f", "center", 800, 757],
  ],
  pill: [380, 700, 1220, 790],
};

export function poster() {
  const { c, ctx } = canvas(POSTER.w, POSTER.h);
  const g = ctx.createLinearGradient(0, 0, 0, POSTER.h);
  g.addColorStop(0, "#0a1a3f");
  g.addColorStop(1, "#1d3f7a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, POSTER.w, POSTER.h);
  // a faint texture: +-5 levels of seeded noise
  const img = ctx.getImageData(0, 0, POSTER.w, POSTER.h);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = Math.round((rnd() - 0.5) * 10);
    for (let k = 0; k < 3; k++) img.data[i + k] = Math.max(0, Math.min(255, img.data[i + k] + n));
  }
  ctx.putImageData(img, 0, 0);
  const [px0, py0, px1, py1] = POSTER.pill;
  const r = (py1 - py0) / 2;
  ctx.fillStyle = "#f5c542";
  ctx.beginPath();
  ctx.arc(px0 + r, py0 + r, r, Math.PI / 2, 1.5 * Math.PI);
  ctx.arc(px1 - r, py0 + r, r, 1.5 * Math.PI, Math.PI / 2);
  ctx.closePath();
  ctx.fill();
  for (const [text, font, colour, align, x, y] of POSTER.lines) {
    ctx.font = font;
    ctx.fillStyle = colour;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
  }
  return c;
}

const VI = {
  title: "Kết quả nghiên cứu thực địa",
  bullets: ["Mẫu được thu thập tại 42 địa điểm", "Thời gian xử lý trung bình giảm 18%",
    "Hai người đọc kiểm tra từng báo cáo", "Bước tiếp theo: mở rộng nhóm nghiên cứu"],
};

window.__make = async () => {
  const out = {};
  out["slide.png"] = { dataUrl: slide(SLIDE.bullets, SLIDE.title).toDataURL("image/png"), truth: [SLIDE.title].concat(SLIDE.bullets) };
  out["vi.png"] = { dataUrl: slide(VI.bullets, VI.title).toDataURL("image/png"), truth: [] };
  const blank = canvas(1200, 800);
  const g = blank.ctx.createLinearGradient(0, 0, 1200, 800);
  g.addColorStop(0, "#9ec5e8");
  g.addColorStop(1, "#f3e3c3");
  blank.ctx.fillStyle = g;
  blank.ctx.fillRect(0, 0, 1200, 800);
  blank.ctx.fillStyle = "#5a7d5a";
  blank.ctx.beginPath();
  blank.ctx.arc(600, 420, 180, 0, 2 * Math.PI);
  blank.ctx.fill();
  out["blank.png"] = { dataUrl: blank.c.toDataURL("image/png"), truth: [] };
  const p = photo(11);
  out["photo.jpg"] = { dataUrl: p.canvas.toDataURL("image/jpeg", 0.9), truth: p.truth };
  // the English slide as a camera stores a portrait shot: turned 90 degrees counter-clockwise (EXIF 6 turns it back)
  const s = slide(SLIDE.bullets, SLIDE.title);
  const t = canvas(s.height, s.width);
  t.ctx.translate(0, s.width);
  t.ctx.rotate(-Math.PI / 2);
  t.ctx.drawImage(s, 0, 0);
  out["turned.jpg"] = { dataUrl: t.c.toDataURL("image/jpeg", 0.92), truth: [SLIDE.title].concat(SLIDE.bullets) };
  out["poster.png"] = { dataUrl: poster().toDataURL("image/png"), truth: POSTER.lines.map((l) => l[0]) };
  return out;
};
