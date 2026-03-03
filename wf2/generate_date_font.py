#!/usr/bin/env python3
"""Generate date-specific font PNGs (digits 0-9) with white text + black outline."""

from PIL import Image, ImageDraw, ImageFont
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = "/tmp/VarelaRound-Regular.ttf"

REF_SIZE = 480
REF_DIGIT_H = 24
OUTLINE_W = 1

RESOLUTIONS = {
    "round": 480,
}


def generate_char(char, font_size, outline):
    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = font.getbbox(char)
    pad = outline + 1
    w = bbox[2] - bbox[0] + pad * 2
    h = bbox[3] - bbox[1] + pad * 2

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    ox = -bbox[0] + pad
    oy = -bbox[1] + pad

    for dx in range(-outline, outline + 1):
        for dy in range(-outline, outline + 1):
            if dx == 0 and dy == 0:
                continue
            draw.text((ox + dx, oy + dy), char, font=font, fill=(0, 0, 0, 255))

    draw.text((ox, oy), char, font=font, fill=(255, 255, 255, 255))
    return img


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    font_size = max(8, int(round(REF_DIGIT_H * scale * 1.3)))
    outline = max(1, int(round(OUTLINE_W * scale)))

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "date-font")
    os.makedirs(out_dir, exist_ok=True)

    for i in range(10):
        img = generate_char(str(i), font_size, outline)
        img.save(os.path.join(out_dir, str(i) + ".png"))
        if i == 0:
            print(res_name + ": digit size " + str(img.size))

print("Done!")
