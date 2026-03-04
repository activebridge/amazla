#!/usr/bin/env python3
"""Generate small label font PNGs (0-9, a-z, colon, space) for widget labels."""

from PIL import Image, ImageDraw, ImageFont
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = "/System/Library/Fonts/SFNSRounded.ttf"

REF_HEIGHT = 20
OUTLINE_W = 1

def generate_char(char, font_size, outline):
    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = font.getbbox(char)
    pad = outline + 1
    w = max(1, bbox[2] - bbox[0] + pad * 2)
    h = max(1, bbox[3] - bbox[1] + pad * 2)

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    ox = -bbox[0] + pad
    oy = -bbox[1] + pad

    for dx in range(-outline, outline + 1):
        for dy in range(-outline, outline + 1):
            if dx == 0 and dy == 0:
                continue
            draw.text((ox + dx, oy + dy), char, font=font, fill=(0, 0, 0, 200))

    draw.text((ox, oy), char, font=font, fill=(255, 255, 255, 220))
    return img

out_dir = os.path.join(BASE_DIR, "assets", "round", "label-font")
os.makedirs(out_dir, exist_ok=True)

font = ImageFont.truetype(FONT_PATH, REF_HEIGHT)

# Digits 0-9
for i in range(10):
    img = generate_char(str(i), REF_HEIGHT, OUTLINE_W)
    img.save(os.path.join(out_dir, f"{i}.png"))

# Letters a-z
for c in "abcdefghijklmnopqrstuvwxyz":
    img = generate_char(c, REF_HEIGHT, OUTLINE_W)
    img.save(os.path.join(out_dir, f"{c}.png"))

# Special chars
generate_char(":", REF_HEIGHT, OUTLINE_W).save(os.path.join(out_dir, "colon.png"))
generate_char(" ", REF_HEIGHT, OUTLINE_W).save(os.path.join(out_dir, "space.png"))
generate_char("-", REF_HEIGHT, OUTLINE_W).save(os.path.join(out_dir, "minus.png"))

print(f"Generated {10 + 26 + 3} label font chars in {out_dir}")
