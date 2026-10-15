// Synthetic test images for the OCR runners (browser only): English text written for these tests (no document's
// text), drawn on canvases as a slide, a page of body text, a table, rotated, low-contrast and photo-like variants.
// Each case: { name, canvas, truth: [lines in reading order] }. Test infrastructure only (never deployed).

export const SLIDE = {
  title: "Quarterly Results of the Field Study",
  bullets: [
    "Samples were collected from 42 sites in 2024",
    "Mean processing time fell by 18% after training",
    "Two reviewers checked every report independently",
    "Agreement between reviewers reached 0.87 (kappa)",
    "Next steps: expand the panel and repeat at 6 months",
  ],
};

export const PARAGRAPH = "Digital imaging allows a laboratory to share slides with remote experts within minutes. "
  + "In this pilot, each image was scanned at high resolution, compressed with a lossless method, and stored on a "
  + "secure server. Reviewers opened the files in a web viewer and recorded their findings in a structured form. The "
  + "average time from scanning to the first opinion was 37 minutes, compared with two days for courier transport. "
  + "Image quality was rated adequate in 96 of 100 cases; the remaining four required a second scan because of focus "
  + "problems or air bubbles under the cover glass.";

export const TABLE = [
  ["Marker", "Positive", "Negative", "Total"],
  ["Ki-67", "128", "72", "200"],
  ["CD34", "45", "155", "200"],
  ["Vimentin", "190", "10", "200"],
  ["S-100", "33", "167", "200"],
];

function canvas(w, h, bg) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg || "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = "alphabetic";
  return { c, ctx };
}

// greedy word wrap with the canvas' own measure
function wrap(ctx, text, width) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? line + " " + word : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// the slide drawn on ctx at scale s (1 = 1600 x 900)
function drawSlide(ctx, s, color) {
  ctx.fillStyle = color || "#1b2a3a";
  ctx.font = "bold " + Math.round(56 * s) + "px Arial, sans-serif";
  ctx.fillText(SLIDE.title, 90 * s, 150 * s);
  ctx.font = Math.round(34 * s) + "px Arial, sans-serif";
  SLIDE.bullets.forEach((b, i) => {
    const y = (290 + i * 105) * s;
    ctx.beginPath();
    ctx.arc(115 * s, y - 11 * s, 7 * s, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillText(b, 145 * s, y);
  });
  return [SLIDE.title].concat(SLIDE.bullets);
}

function slide() {
  const { c, ctx } = canvas(1600, 900);
  return { name: "slide", canvas: c, truth: drawSlide(ctx, 1) };
}

function paragraph(fg, bg, name) {
  const { c, ctx } = canvas(1240, 900, bg);
  ctx.fillStyle = fg || "#111111";
  ctx.font = "26px 'Times New Roman', serif";
  const lines = wrap(ctx, PARAGRAPH, 1060);
  lines.forEach((l, i) => ctx.fillText(l, 90, 120 + i * 44));
  return { name: name || "paragraph", canvas: c, truth: lines };
}

function table() {
  const { c, ctx } = canvas(1300, 760);
  const xs = [80, 420, 700, 980], y0 = 120, rowH = 110;
  ctx.strokeStyle = "#7a8796";
  ctx.lineWidth = 2;
  for (let r = 0; r <= TABLE.length; r++) {
    ctx.beginPath();
    ctx.moveTo(60, y0 - 60 + r * rowH);
    ctx.lineTo(1240, y0 - 60 + r * rowH);
    ctx.stroke();
  }
  TABLE.forEach((row, r) => {
    ctx.fillStyle = "#14202c";
    ctx.font = (r === 0 ? "bold " : "") + "34px Calibri, Arial, sans-serif";
    row.forEach((cell, k) => ctx.fillText(cell, xs[k], y0 + r * rowH));
  });
  return { name: "table", canvas: c, truth: TABLE.map((row) => row.join(" ")) };
}

function rotated(deg) {
  const { c, ctx } = canvas(1600, 900);
  ctx.translate(800, 450);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-800, -450);
  return { name: "rotated " + deg, canvas: c, truth: drawSlide(ctx, 1) };
}

// a camera-like 2048 x 1536 picture of the slide: tilted, a light gradient, sensor noise, a little blur
export function photo(seed) {
  const W = 2048, H = 1536;
  const { c, ctx } = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#f4f1ea");
  g.addColorStop(1, "#d9d4c8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.filter = "blur(0.7px)";
  ctx.translate(W / 2, H / 2);
  ctx.rotate((2 * Math.PI) / 180);
  ctx.translate(-W / 2 + 120, -H / 2 + 260);
  const truth = drawSlide(ctx, 1.12, "#202833");
  ctx.restore();
  const img = ctx.getImageData(0, 0, W, H);
  let s = seed || 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 18;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return { name: "photo 2048", canvas: c, truth };
}

export const PARAGRAPH2 = "A second reader repeated the count on a random half of the images without seeing the first "
  + "results. Differences larger than ten percent were discussed at a weekly meeting, and the final value was the one "
  + "both readers accepted. Training material for new staff now includes twelve worked examples and a short quiz.";

// a page of small text (16 px on a 2048 px wide picture): what a phone photo of a printed page gives
function smallText() {
  const { c, ctx } = canvas(2048, 1536, "#fbfaf6");
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "16px Georgia, 'Times New Roman', serif";
  const lines = wrap(ctx, PARAGRAPH, 1500).concat(wrap(ctx, PARAGRAPH2, 1500));
  lines.forEach((l, i) => ctx.fillText(l, 260, 300 + i * 26));
  return { name: "small text 16px", canvas: c, truth: lines };
}

/** The accuracy cases: clean renders first (the CER target), then the harder variants. */
export function cases() {
  return [
    Object.assign(slide(), { clean: true }),
    Object.assign(paragraph(), { clean: true }),
    Object.assign(table(), { clean: true }),
    rotated(3),
    rotated(-5),
    paragraph("#8a8a8a", "#d6d6d6", "low contrast"),
    smallText(),
    photo(),
  ];
}
