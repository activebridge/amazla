#!/usr/bin/env python3
"""Generate moon phase label images (30 phases) for watchface overlay."""

from PIL import Image, ImageDraw, ImageFont
import os

RESOLUTIONS = {"round": 480}
FONT_PATH = "/System/Library/Fonts/SFNSRounded.ttf"
FONT_SIZE = 30
OUTLINE_W = 1

def phase_name(i):
    if i == 0 or i == 29:  return "New"
    elif 1 <= i <= 6:       return "Crescent"
    elif i == 7:            return "Quarter"
    elif 8 <= i <= 13:      return "Gibbous"
    elif i == 14:           return "Full"
    elif 15 <= i <= 20:     return "Gibbous"
    elif i == 21:           return "Quarter"
    else:                   return "Crescent"

def make_label(text, font, canvas_w, canvas_h, baseline_y, out_path):
    img = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for dx in range(-OUTLINE_W, OUTLINE_W + 1):
        for dy in range(-OUTLINE_W, OUTLINE_W + 1):
            if dx or dy:
                draw.text((OUTLINE_W + dx, baseline_y + dy), text, font=font, fill=(0, 0, 0, 200))
    draw.text((OUTLINE_W, baseline_y), text, font=font, fill=(255, 255, 255, 220))
    img.save(out_path)

def main():
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
    ascent, descent = font.getmetrics()
    labels = [phase_name(i) for i in range(30)]
    canvas_w = int(max(font.getlength(l) for l in labels)) + OUTLINE_W * 2 + 2
    canvas_h = ascent + descent + OUTLINE_W * 2
    baseline_y = OUTLINE_W

    for res_name in RESOLUTIONS:
        out_dir = os.path.join("assets", res_name, "moon-label")
        os.makedirs(out_dir, exist_ok=True)
        for i in range(30):
            path = os.path.join(out_dir, str(i) + ".png")
            make_label(phase_name(i), font, canvas_w, canvas_h, baseline_y, path)
            print("Generated " + path + " (" + str(canvas_w) + "x" + str(canvas_h) + ")")

if __name__ == "__main__":
    main()
