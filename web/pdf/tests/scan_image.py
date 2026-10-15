"""Make the picture of a scanned page for the PDF path's tests (synthetic text only).

Writes web/pdf/tests/fixtures/scan.png (an A4 page at 100 dpi: 827 x 1169 pixels, off-white paper, dark grey text
drawn with the vendored Noto Sans) and scan.json (each line's text and its box as fractions of the page, the answer
the OCR stub gives). Then `node web/pdf/tests/make_pdfs.mjs` puts the picture into scan.pdf (an image-only page).

Usage: <python of the helper env (Pillow)> web/pdf/tests/scan_image.py   (paths are taken from this file's folder)
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
FONT = HERE.parent / "fonts" / "NotoSans-Regular.ttf"
BOLD = HERE.parent / "fonts" / "NotoSans-Bold.ttf"
W, H = 827, 1169
PAPER = (245, 243, 236)
INK = (40, 40, 40)

LINES = [
    ("Case report", BOLD, 30, 120),
    ("A synthetic scanned page with English text lines.", FONT, 20, 190),
    ("The lesion is composed of bland spindle cells", FONT, 20, 218),
    ("arranged in short fascicles without necrosis.", FONT, 20, 246),
    ("Immunohistochemistry was negative for S100 protein.", FONT, 20, 310),
]


def main():
    img = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(img)
    out = []
    for text, font_path, size, y in LINES:
        font = ImageFont.truetype(str(font_path), size)
        x = 90
        draw.text((x, y), text, font=font, fill=INK)
        x0, y0, x1, y1 = draw.textbbox((x, y), text, font=font)
        out.append({"text": text, "box": [round(x0 / W, 5), round((y0 - 3) / H, 5), round(x1 / W, 5),
                                          round((y1 + 3) / H, 5)]})
    fixtures = HERE / "fixtures"
    fixtures.mkdir(exist_ok=True)
    img.save(fixtures / "scan.png", optimize=True)
    (fixtures / "scan.json").write_text(json.dumps({"page": [W, H], "lines": out}, indent=1) + "\n",
                                        encoding="utf-8", newline="\n")
    print("scan.png and scan.json written: %d lines" % len(out))


if __name__ == "__main__":
    main()
