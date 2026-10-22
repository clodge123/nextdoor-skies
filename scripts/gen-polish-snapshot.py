#!/usr/bin/env python3
"""W3-E1: regenerate tests/fixtures/polish-map.jpg (deterministic, no RNG).

The REAL_API harness has no live WebGL map, so the gated seed spec ships this
committed, deterministic, map-LIKE basemap frame as the snapshot payload —
real JPEG bytes with real pixel variance (the C7 non-black gate proves it in
browser). Draw order and constants are fixed: same bytes every run.
"""
import math
from PIL import Image, ImageDraw

W, H = 600, 400
img = Image.new("RGB", (W, H))
px = img.load()

# Terrain gradient (plains -> ridge), fixed math, no randomness.
for y in range(H):
    t = y / H
    for x in range(W):
        n = (x + y) / (W + H)
        r = int(178 - 60 * n + 30 * math.sin(x / 37.0) * math.sin(y / 29.0))
        g = int(196 - 70 * n + 25 * math.sin(x / 53.0 + 1.7) * math.sin(y / 41.0))
        b = int(150 - 40 * n + 18 * math.sin((x + y) / 61.0))
        px[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))

d = ImageDraw.Draw(img)
# Contour-ish bands (topography nod), fixed offsets.
for k in range(7):
    off = 30 + k * 18
    d.arc([150 - off, 100 - off // 2, 150 + off, 100 + off // 2 + 120], 210, 330,
          fill=(150, 120, 90), width=2)
# River: smooth sine path.
pts = [(x, int(250 + 60 * math.sin(x / 90.0))) for x in range(0, W, 4)]
d.line(pts, fill=(90, 130, 180), width=7)
# Roads: grid + diagonal.
d.line([(0, 180), (W, 165)], fill=(210, 205, 195), width=5)
d.line([(240, 0), (270, H)], fill=(210, 205, 195), width=5)
d.line([(0, 60), (W, 340)], fill=(225, 220, 210), width=3)
# Town blocks (downtown grid), fixed.
for i in range(6):
    for j in range(4):
        x0, y0 = 300 + i * 26, 60 + j * 26
        d.rectangle([x0, y0, x0 + 16, y0 + 14], fill=(190, 175, 160), outline=(120, 110, 95))
# Park block.
d.rectangle([70, 300, 190, 370], fill=(150, 190, 130), outline=(110, 150, 95))
img.save("tests/fixtures/polish-map.jpg", "JPEG", quality=72, optimize=True)
print("wrote tests/fixtures/polish-map.jpg")
