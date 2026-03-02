#!/usr/bin/env python3
"""Generate date background assets: calendar icon with header bar + binding rings."""

from PIL import Image, ImageDraw
import os
from gradient_utils import lighten, darken

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

REF_SIZE = 480
REF_ICON = 40
REF_RADIUS = 8
OUTLINE = 2

RESOLUTIONS = {
    "480x480": 480,
    "466x466": 466,
    "454x454": 454,
    "416x416": 416,
    "390x450": 390,
    "360x360": 360,
    "320x380": 320,
}

COLORS = {
    "blue":   (60,  120, 220),
    "green":  (60,  180,  80),
    "yellow": (220, 180,  40),
    "red":    (220,  60,  60),
}


def gen_calendar(sz, radius, outline, color):
    up = 4
    big = sz * up
    r = radius * up
    pad = outline * up
    ring_r = big // 10 + up   # binding dot radius (+1px)
    ring_gap = 15 * up        # 15px gap between dots

    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Black outline (full rounded rect)
    draw.rounded_rectangle([0, 0, big - 1, big - 1], radius=r, fill=(0, 0, 0, 255))

    # Body: gradient fill
    color_top = lighten(color, 0.3)
    color_bot = darken(color, 0.2)
    body_mask = Image.new("L", (big, big), 0)
    bm_draw = ImageDraw.Draw(body_mask)
    bm_draw.rounded_rectangle([pad, pad, big - 1 - pad, big - 1 - pad], radius=max(1, r - pad), fill=255)

    grad = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(grad)
    for y in range(big):
        t = y / max(1, big - 1)
        rv = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        gv = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        bv = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        grad_draw.line([(0, y), (big - 1, y)], fill=(rv, gv, bv, 255))
    grad.putalpha(body_mask)
    img.paste(grad, mask=grad)

    # Two black dots at top center
    ring_y = pad + ring_r - 5 * up  # dots near top edge
    dots = [
        (big // 2 - ring_r - ring_gap // 2 + 2 * up, ring_y - up),
        (big // 2 + ring_r + ring_gap // 2 - 4 * up, ring_y - up),
    ]
    for rx, ry in dots:
        draw.ellipse([rx - ring_r, ry - ring_r, rx + ring_r, ry + ring_r],
                     fill=(0, 0, 0, 255))

    return img.resize((sz, sz), Image.LANCZOS)


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sz = max(8, int(round(REF_ICON * scale)))
    radius = max(2, int(round(REF_RADIUS * scale)))
    outline = max(1, int(round(OUTLINE * scale)))

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "date")
    os.makedirs(out_dir, exist_ok=True)

    for name, color in COLORS.items():
        img = gen_calendar(sz, radius, outline, color)
        img.save(os.path.join(out_dir, name + ".png"))

    print(res_name + ": 4 calendar icons, " + str(sz) + "x" + str(sz))

print("Done!")
