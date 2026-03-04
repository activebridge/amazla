#!/usr/bin/env python3
"""Generate weekday label images (Sun–Sat) for watchface overlay, matching label-font style."""

from PIL import Image, ImageDraw, ImageFont
import os

RESOLUTIONS = {"round": 480}
DAYS = ["onday", "uesday", "ednesday", "hursday", "riday", "aturday", "unday"]
FONT_PATH = "/System/Library/Fonts/SFNSRounded.ttf"
FONT_SIZE = 30
OUTLINE_W = 1
CHAR_SPACING = -5

def generate_char(char, font):
    bbox = font.getbbox(char)
    pad = OUTLINE_W + 1
    w = max(1, bbox[2] - bbox[0] + pad * 2)
    h = max(1, bbox[3] - bbox[1] + pad * 2)
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    ox = -bbox[0] + pad
    oy = -bbox[1] + pad
    for dx in range(-OUTLINE_W, OUTLINE_W + 1):
        for dy in range(-OUTLINE_W, OUTLINE_W + 1):
            if dx or dy:
                draw.text((ox + dx, oy + dy), char, font=font, fill=(0, 0, 0, 200))
    draw.text((ox, oy), char, font=font, fill=(255, 255, 255, 220))
    return img

def make_word_image(text, font, canvas_w, canvas_h, baseline_y):
    img = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for dx in range(-OUTLINE_W, OUTLINE_W + 1):
        for dy in range(-OUTLINE_W, OUTLINE_W + 1):
            if dx or dy:
                draw.text((OUTLINE_W + dx, baseline_y + dy), text, font=font, fill=(0, 0, 0, 200), spacing=CHAR_SPACING)
    draw.text((OUTLINE_W, baseline_y), text, font=font, fill=(255, 255, 255, 220))
    return img

def main():
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
    # Measure all words to find canvas size
    ascent, descent = font.getmetrics()
    widths = [font.getlength(day) for day in DAYS]
    canvas_w = int(max(widths)) + OUTLINE_W * 2 + 2
    canvas_h = ascent + descent + OUTLINE_W * 2
    baseline_y = OUTLINE_W

    for res_name in RESOLUTIONS:
        out_dir = os.path.join("assets", res_name, "weekday-label")
        os.makedirs(out_dir, exist_ok=True)
        for i, day in enumerate(DAYS):
            path = os.path.join(out_dir, str(i) + ".png")
            make_word_image(day, font, canvas_w, canvas_h, baseline_y).save(path)
            print("Generated " + path + " (" + str(canvas_w) + "x" + str(canvas_h) + ")")

if __name__ == "__main__":
    main()
