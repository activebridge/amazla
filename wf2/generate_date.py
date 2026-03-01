#!/usr/bin/env python3
"""Generate date assets: moon phase backgrounds + white/outlined digit font."""

from PIL import Image, ImageDraw, ImageFont
import math
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = "/tmp/VarelaRound-Regular.ttf"

REF_SIZE = 480
REF_ICON = 36
REF_OUTLINE = 3

RESOLUTIONS = {
    "480x480": 480,
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
    return img.resize((sz, sz), Image.LANCZOS)


def gen_digit(char, font_size, outline):
    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = font.getbbox(char)
    pad = outline + 1
    w = bbox[2] - bbox[0] + pad * 2
    h = bbox[3] - bbox[1] + pad * 2
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    ox = -bbox[0] + pad
    oy = -bbox[1] + pad
    # Black outline
    for dx in range(-outline, outline + 1):
        for dy in range(-outline, outline + 1):
            if dx == 0 and dy == 0:
                continue
            draw.text((ox + dx, oy + dy), char, font=font, fill=(0, 0, 0, 255))
    # White fill
    draw.text((ox, oy), char, font=font, fill=(255, 255, 255, 255))
    return img


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sz = max(6, int(round(REF_ICON * scale)))
    outline = max(1, int(round(REF_OUTLINE * scale)))

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "date")
    os.makedirs(out_dir, exist_ok=True)

    # 30 moon phase backgrounds
    for phase in range(30):
        moon = gen_moon(sz, outline, phase)
        moon.save(os.path.join(out_dir, "moon_" + str(phase) + ".png"))

    # Gray moon background (full circle, always visible)
    gray_moon = gen_moon(sz, outline, 15)  # full moon shape
    # Recolor to gray
    r, g, b, a = gray_moon.split()
    r = r.point(lambda x: int(x * 80 / 255))
    g = g.point(lambda x: int(x * 80 / 255))
    b = b.point(lambda x: int(x * 80 / 255))
    gray_moon = Image.merge("RGBA", (r, g, b, a))
    gray_moon.save(os.path.join(out_dir, "moon_gray.png"))

    # Digit font (white with black outline)
    inner = sz - outline * 2
    font_size = int(inner * 0.55)
    digit_outline = max(1, outline // 2)
    for d in range(10):
        digit = gen_digit(str(d), font_size, digit_outline)
        digit.save(os.path.join(out_dir, str(d) + ".png"))

    sample = gen_digit("0", font_size, digit_outline)
    print(res_name + ": 30 moon + 10 digits, " + str(sz) + "x" + str(sz) + " digit=" + str(sample.size))

print("Done!")
