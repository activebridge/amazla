#!/usr/bin/env python3
"""Recolor weekday icon palettes to per-day colors, preserving structure and transparency."""

from PIL import Image
import colorsys
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Target colors: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
TARGET_COLORS = [
    (70,  130, 220),  # 0 Mon - blue     (keep)
    (80,  190, 210),  # 1 Tue - cyan
    (70,  180, 90),   # 2 Wed - green
    (210, 175, 45),   # 3 Thu - yellow
    (220, 115, 45),   # 4 Fri - orange
    (200, 60,  60),   # 5 Sat - red      (keep)
    (220, 50,  50),   # 6 Sun - red      (keep)
]

WEEKDAY_DIR = os.path.join(BASE_DIR, "assets", "round", "weekday")


def recolor_palette(pal_flat, n_colors, target_rgb):
    tr, tg, tb = target_rgb
    target_h, target_s, target_v = colorsys.rgb_to_hsv(tr/255, tg/255, tb/255)

    new_pal = []
    for j in range(n_colors):
        r = pal_flat[j * 3]
        g = pal_flat[j * 3 + 1]
        b = pal_flat[j * 3 + 2]

        h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)

        # Skip: very dark (outline/bg) or very desaturated (white letter / neutral)
        if v < 0.05 or s < 0.08:
            new_pal.extend([r, g, b])
            continue

        # Shift hue to target, keep saturation and value
        nr, ng, nb = colorsys.hsv_to_rgb(target_h, s, v)
        new_pal.extend([round(nr * 255), round(ng * 255), round(nb * 255)])

    return new_pal


for day_id, target_rgb in enumerate(TARGET_COLORS):
    path = os.path.join(WEEKDAY_DIR, f"{day_id}.png")
    img = Image.open(path)

    assert img.mode == 'P', f"{day_id}.png is not palette mode"
    trans = img.info.get('transparency')

    pal = img.getpalette()
    n_colors = len(pal) // 3

    new_pal = recolor_palette(pal, n_colors, target_rgb)

    # Pad to 768 if needed
    while len(new_pal) < 768:
        new_pal.append(0)

    img.putpalette(new_pal)
    img.save(path, transparency=trans)
    print(f"{day_id}.png -> hue of {target_rgb}")

print("Done!")
