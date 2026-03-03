#!/usr/bin/env python3
"""Generate temperature font PNGs using Varela Round with 2px black outline."""

from PIL import Image, ImageDraw, ImageFont
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = "/tmp/VarelaRound-Regular.ttf"

REF_SIZE = 480
REF_DIGIT_H = 28
OUTLINE_W = 2

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


def generate_degree(font_size, outline):
    font = ImageFont.truetype(FONT_PATH, font_size)
    char = "\u00B0"
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


def generate_minus(font_size, outline):
    return generate_char("-", font_size, outline)


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    digit_h = int(round(REF_DIGIT_H * scale))
    outline = max(1, int(round(OUTLINE_W * scale)))

    lo, hi = 10, 300
    while lo < hi:
        mid = (lo + hi) // 2
        font = ImageFont.truetype(FONT_PATH, mid)
        bbox = font.getbbox("0")
        h = bbox[3] - bbox[1]
        if h < digit_h:
            lo = mid + 1
        else:
            hi = mid
    font_size = lo

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "fonts")
    os.makedirs(out_dir, exist_ok=True)

    for d in range(10):
        img = generate_char(str(d), font_size, outline)
        img.save(os.path.join(out_dir, str(d) + ".png"))

    degree = generate_degree(font_size, outline)
    degree.save(os.path.join(out_dir, "degree.png"))

    minus = generate_minus(font_size, outline)
    minus.save(os.path.join(out_dir, "minus.png"))

    sample = generate_char("0", font_size, outline)
    print(res_name + ": font_size=" + str(font_size) +
          ", outline=" + str(outline) +
          ", sample_0=" + str(sample.size))

print("Done!")
