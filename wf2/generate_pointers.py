#!/usr/bin/env python3
"""Generate neomorphic seconds pointer PNG for all resolutions."""

from PIL import Image, ImageDraw
import math
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

REF_SIZE = 480
SECOND_W, SECOND_H = 16, 260

RESOLUTIONS = {
    "round": 480,
}


def make_second_pointer(w, h):
    """Small pill tip with gradient and 2px black outline on all edges, transparent below."""
    pad = 2
    iw = w + pad * 2
    img = Image.new("RGBA", (iw, h), (0, 0, 0, 0))

    tip_h = int(round(45 * h / SECOND_H))
    radius = w // 2

    # Black outline (2px on all sides)
    outline = Image.new("RGBA", (iw, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(outline)
    od.rounded_rectangle([0, 0, iw - 1, tip_h + pad], radius=radius + pad, fill=(0, 0, 0, 255))
    img = Image.alpha_composite(img, outline)

    # Gradient fill clipped to pill shape (offset by pad)
    for y in range(tip_h):
        t = y / max(tip_h - 1, 1)
        g = int(220 - t * 80)
        b = int(255 - t * 75)
        color = (0, g, b, 255)
        for x in range(w):
            inside = False
            if radius <= y <= tip_h - radius - 1:
                inside = True
            elif y < radius:
                inside = math.sqrt((x - radius) ** 2 + (y - radius) ** 2) <= radius
            else:
                inside = math.sqrt((x - radius) ** 2 + (y - (tip_h - radius - 1)) ** 2) <= radius
            if inside:
                img.putpixel((x + pad, y + pad), color)

    return img


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sw = max(4, int(round(SECOND_W * scale)) | 1)
    sh = max(20, int(round(SECOND_H * scale)))

    second_img = make_second_pointer(sw, sh)

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "pointer")
    os.makedirs(out_dir, exist_ok=True)
    second_img.save(os.path.join(out_dir, "hour.png"))
    second_img.save(os.path.join(out_dir, "seconds.png"))

    print(res_name + ": " + str(second_img.size))

print("Done!")
