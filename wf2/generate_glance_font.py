#!/usr/bin/env python3
"""Generate small glance font PNGs using Arial Bold with black outline."""

from PIL import Image, ImageDraw, ImageFont
import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

REF_SIZE = 480
# Adjusted to 24 (middle ground between 16 and 32)
REF_DIGIT_H = 24
OUTLINE_W = 1 # Back to 1px outline for cleaner look at this size

RESOLUTIONS = {
    "round": 480,
}

CHARS = {}
for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789":
    CHARS[c] = c + ".png"

SPECIAL = {
    ",": "comma.png",
    ":": "colon.png",
    "\u00B0": "degree.png",
    "\u00B7": "dot.png",
    "-": "dash.png",
    "%": "percent.png",
    "|": "pipe.png",
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
            if dx == 0 and dy == 0: continue
            draw.text((ox + dx, oy + dy), char, font=font, fill=(0, 0, 0, 255))
    draw.text((ox, oy), char, font=font, fill=(255, 255, 255, 255))
    return img

def generate_space(digit_h):
    w = max(4, digit_h // 3)
    return Image.new("RGBA", (w, digit_h), (0, 0, 0, 0))

def find_font_size(target_h):
    lo, hi = 6, 200
    while lo < hi:
        mid = (lo + hi) // 2
        font = ImageFont.truetype(FONT_PATH, mid)
        bbox = font.getbbox("A")
        h = bbox[3] - bbox[1]
        if h < target_h: lo = mid + 1
        else: hi = mid
    return lo

for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    digit_h = max(10, int(round(REF_DIGIT_H * scale)))
    outline = 1
    font_size = find_font_size(digit_h)
    out_dir = os.path.join(BASE_DIR, "assets", res_name, "glance")
    os.makedirs(out_dir, exist_ok=True)
    widths = {}
    for char, filename in CHARS.items():
        img = generate_char(char, font_size, outline)
        img.save(os.path.join(out_dir, filename))
        widths[char] = img.size[0]
    for char, filename in SPECIAL.items():
        img = generate_char(char, font_size, outline)
        img.save(os.path.join(out_dir, filename))
        key = filename.replace(".png", "")
        widths[key] = img.size[0]
    space_img = generate_space(digit_h)
    space_img.save(os.path.join(out_dir, "space.png"))
    widths["space"] = space_img.size[0]
    with open(os.path.join(out_dir, "widths.json"), "w") as f:
        json.dump(widths, f)
    print(f"{res_name}: font_size={font_size}, digit_h={digit_h}")
print("Done!")
