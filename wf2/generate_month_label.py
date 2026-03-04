#!/usr/bin/env python3
"""Generate vertical 3-letter month label images (12 months)."""

from PIL import Image, ImageDraw, ImageFont
import os

FONT_PATH = "/System/Library/Fonts/SFNSRounded.ttf"
FONT_SIZE = 30
OUTLINE_W = 1

MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

def main():
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
    ascent, descent = font.getmetrics()
    char_h = ascent + descent
    pad = OUTLINE_W + 1

    # Canvas: wide enough for widest char, tall enough for 3 stacked chars
    max_char_w = max(font.getbbox(c)[2] - font.getbbox(c)[0] for m in MONTHS for c in m)
    canvas_w = max_char_w + pad * 2
    row_step = 24  # tight spacing: 2px gap between uppercase chars
    canvas_h = row_step * 3 + pad * 2

    out_dir = os.path.join("assets", "round", "month-label")
    os.makedirs(out_dir, exist_ok=True)

    for idx, month in enumerate(MONTHS):
        img = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        for row, char in enumerate(month):
            bbox = font.getbbox(char)
            char_w = bbox[2] - bbox[0]
            x = (canvas_w - char_w) // 2 - bbox[0]
            y = pad + row * row_step - bbox[1]

            for dx in range(-OUTLINE_W, OUTLINE_W + 1):
                for dy in range(-OUTLINE_W, OUTLINE_W + 1):
                    if dx or dy:
                        draw.text((x + dx, y + dy), char, font=font, fill=(0, 0, 0, 200))
            draw.text((x, y), char, font=font, fill=(255, 255, 255, 220))

        path = os.path.join(out_dir, str(idx) + ".png")
        img.save(path)
        print("Generated " + path + " (" + str(canvas_w) + "x" + str(canvas_h) + ")")

if __name__ == "__main__":
    main()
