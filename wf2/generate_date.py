#!/usr/bin/env python3
"""Generate date background assets: colored rounded-rect squares per week."""

from PIL import Image, ImageDraw
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

REF_SIZE = 480
REF_ICON = 36
REF_RADIUS = 6

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


def gen_rect(sz, radius, color):
    img = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, sz - 1, sz - 1], radius=radius, fill=color + (255,))
    return img


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sz = max(6, int(round(REF_ICON * scale)))
    radius = max(2, int(round(REF_RADIUS * scale)))

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "date")
    os.makedirs(out_dir, exist_ok=True)

    for name, color in COLORS.items():
        img = gen_rect(sz, radius, color)
        img.save(os.path.join(out_dir, name + ".png"))

    print(res_name + ": 4 date backgrounds, " + str(sz) + "x" + str(sz) + " radius=" + str(radius))

print("Done!")
