#!/usr/bin/env python3
"""Generate neomorphic inset hour marker dot PNG for all resolutions."""

from PIL import Image, ImageDraw, ImageFilter
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

REF_SIZE = 480
REF_DOT_R = 4

RESOLUTIONS = {
    "round": 480,
}


def make_dot(dot_r):
    pad = 6
    sz = dot_r * 2 + pad * 2
    img = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))

    cx, cy = sz // 2, sz // 2

    # Light highlight bottom-right (inset: light catches lower edge)
    light = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
    ld = ImageDraw.Draw(light)
    ld.ellipse(
        [cx - dot_r + 2, cy - dot_r + 2, cx + dot_r + 2, cy + dot_r + 2],
        fill=(255, 255, 255, 70)
    )
    light = light.filter(ImageFilter.GaussianBlur(3))
    img = Image.alpha_composite(img, light)

    # Dark shadow top-left (inset: shadow falls inside from top-left)
    shadow = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse(
        [cx - dot_r - 2, cy - dot_r - 2, cx + dot_r - 2, cy + dot_r - 2],
        fill=(0, 0, 0, 180)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(3))
    img = Image.alpha_composite(img, shadow)

    # Inset body - slightly visible against black
    body = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    bd.ellipse(
        [cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r],
        fill=(255, 255, 255, 255)
    )
    img = Image.alpha_composite(img, body)

    return img


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    dot_r = max(2, int(round(REF_DOT_R * scale)))

    dot_img = make_dot(dot_r)

    out_dir = os.path.join(BASE_DIR, "assets", res_name)
    os.makedirs(out_dir, exist_ok=True)
    dot_img.save(os.path.join(out_dir, "dot.png"))

    print(res_name + ": " + str(dot_img.size))

print("Done!")
