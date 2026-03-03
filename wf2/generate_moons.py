#!/usr/bin/env python3
"""Generate moon phase assets."""

from PIL import Image, ImageDraw
import math
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

REF_SIZE = 480
REF_ICON = 36
REF_OUTLINE = 3

RESOLUTIONS = {
    "round": 480,
    "466x466": 466,
    "454x454": 454,
    "416x416": 416,
    "390x450": 390,
    "360x360": 360,
    "320x380": 320,
}


def lighten(color, amount=0.3):
    return tuple(min(255, int(c + (255 - c) * amount)) for c in color)

def darken(color, amount=0.3):
    return tuple(max(0, int(c * (1 - amount))) for c in color)

MOON_COLOR = (220, 180, 100)  # gold/amber

def gen_moon(sz, outline, phase_idx):
    """Generate moon phase icon. phase_idx 0-29 (30 lunar days).
    0=new moon, 15=full moon. Curved crescent using spherical projection.
    Gradient gold/amber lit portion on black circle."""
    up = 4
    big = sz * up
    stroke = 2 * up
    inner_sz = big - stroke * 2

    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([0, 0, big - 1, big - 1], fill=(0, 0, 0, 255))

    cx = inner_sz // 2
    cy = inner_sz // 2
    r = inner_sz // 2

    color_top = lighten(MOON_COLOR, 0.3)
    color_bot = darken(MOON_COLOR, 0.3)
    gray_top = (70, 70, 70)
    gray_bot = (30, 30, 30)

    if phase_idx <= 15:
        illum = phase_idx / 15.0
    else:
        illum = (30 - phase_idx) / 15.0
    waxing = phase_idx <= 15

    moon = Image.new("RGBA", (inner_sz, inner_sz), (0, 0, 0, 0))
    for y in range(inner_sz):
        t = y / max(1, inner_sz - 1)
        rv = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        gv = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        bv = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        gr = int(gray_top[0] + (gray_bot[0] - gray_top[0]) * t)

        dy = y - cy
        # Half-width of disc at this row (spherical projection)
        w_sq = r * r - dy * dy
        if w_sq <= 0:
            continue
        w = math.sqrt(w_sq)
        # Curved terminator x position at this row
        tx = math.cos(math.pi * illum) * w

        for x in range(inner_sz):
            dx = x - cx
            if dx * dx + dy * dy > r * r:
                continue

            if phase_idx == 0:
                lit = False
            elif phase_idx == 15:
                lit = True
            elif waxing:
                lit = dx > tx
            else:
                lit = dx < -tx

            if lit:
                moon.putpixel((x, y), (rv, gv, bv, 255))
            else:
                moon.putpixel((x, y), (gr, gr, gr, 255))

    img.paste(moon, (stroke, stroke), moon)
    return img.resize((sz, sz), Image.LANCZOS).rotate(30, resample=Image.BICUBIC, expand=False)


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sz = max(6, int(round(REF_ICON * scale)))
    outline = max(1, int(round(REF_OUTLINE * scale)))

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "moon")
    os.makedirs(out_dir, exist_ok=True)

    # 30 moon phase backgrounds
    for phase in range(30):
        moon = gen_moon(sz, outline, phase)
        moon.save(os.path.join(out_dir, str(phase) + ".png"))

    # Gray moon background (full circle, always visible)
    gray_moon = gen_moon(sz, outline, 15)  # full moon shape
    # Recolor to gray
    r, g, b, a = gray_moon.split()
    r = r.point(lambda x: int(x * 80 / 255))
    g = g.point(lambda x: int(x * 80 / 255))
    b = b.point(lambda x: int(x * 80 / 255))
    gray_moon = Image.merge("RGBA", (r, g, b, a))
    gray_moon.save(os.path.join(out_dir, "gray.png"))

    print(res_name + ": 30 moon phases, " + str(sz) + "x" + str(sz))

print("Done!")
