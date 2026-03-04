#!/usr/bin/env python3
"""Generate moon phase label images (30 phases) for watchface overlay."""

from PIL import Image, ImageDraw, ImageFont
import os

RESOLUTIONS = {"round": 480}
FONT_SIZE = 18
IMG_W, IMG_H = 70, 24

def phase_name(i):
    if i == 0 or i == 29:   return "New"
    elif 1 <= i <= 6:        return "Wx.C"
    elif i == 7:             return "1st Q"
    elif 8 <= i <= 13:       return "Wx.G"
    elif i == 14:            return "Full"
    elif 15 <= i <= 20:      return "Wn.G"
    elif i == 21:            return "3rd Q"
    else:                    return "Wn.C"

def make_label(text, font, out_path):
    img = Image.new('RGBA', (IMG_W, IMG_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = IMG_W // 2, IMG_H // 2
    for dx in [-1, 0, 1]:
        for dy in [-1, 0, 1]:
            if dx or dy:
                draw.text((cx + dx, cy + dy), text, font=font, fill=(0, 0, 0, 200), anchor='mm')
    draw.text((cx, cy), text, font=font, fill=(255, 255, 255, 220), anchor='mm')
    img.save(out_path)

def main():
    try:
        font = ImageFont.truetype("/System/Library/Fonts/SFNSRounded.ttf", FONT_SIZE)
    except Exception:
        font = ImageFont.load_default()

    for res_name in RESOLUTIONS:
        out_dir = os.path.join("assets", res_name, "moon-label")
        os.makedirs(out_dir, exist_ok=True)
        for i in range(30):
            path = os.path.join(out_dir, str(i) + ".png")
            make_label(phase_name(i), font, path)
            print("Generated " + path)

if __name__ == "__main__":
    main()
