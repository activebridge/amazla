#!/usr/bin/env python3
"""Generate PAI icons: 4 unique rounded hexagons colored by progress."""

from PIL import Image, ImageDraw, ImageFilter
import os, math
from gradient_utils import lighten, darken

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

REF_SIZE = 480
REF_ICON = 36

RESOLUTIONS = {
    "480x480": 480,
    "466x466": 466,
    "454x454": 454,
    "416x416": 416,
    "390x450": 390,
    "360x360": 360,
    "320x380": 320,
}

# Unique colors
COLORS = {
    "red": (220, 50, 50),
    "yellow": (240, 200, 40),
    "blue": (60, 130, 220),
    "green": (60, 180, 60),
}

def gen_hex(sz, outline, color):
    up = 4
    big = sz * up
    stroke = 2 * up
    inner_sz = big - stroke * 2

    cx, cy = inner_sz // 2, inner_sz // 2
    r = int(inner_sz * 0.48)
    hex_img = Image.new("RGBA", (inner_sz, inner_sz), (0, 0, 0, 0))
    hex_draw = ImageDraw.Draw(hex_img)
    pts = []
    for i in range(6):
        angle = math.radians(60 * i - 90)
        pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    hex_draw.polygon(pts, fill=(255, 255, 255, 255))
    alpha = hex_img.split()[3]
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=up * 1.5))
    hex_mask = alpha.point(lambda x: 255 if x > 80 else 0)

    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    black_hex = Image.new("RGBA", (inner_sz, inner_sz), (0, 0, 0, 0))
    black_hex.putalpha(hex_mask)
    black_solid = Image.new("RGBA", (inner_sz, inner_sz), (0, 0, 0, 255))
    black_solid.putalpha(hex_mask)
    for dx in range(-stroke, stroke + 1):
        for dy in range(-stroke, stroke + 1):
            if dx * dx + dy * dy <= stroke * stroke:
                img.paste(black_solid, (stroke + dx, stroke + dy), black_solid)
    
    color_top = lighten(color, 0.3)
    color_bot = darken(color, 0.3)
    grad = Image.new("RGBA", (inner_sz, inner_sz), (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(grad)
    for y in range(inner_sz):
        t = y / max(1, inner_sz - 1)
        rv = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        gv = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        bv = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        grad_draw.line([(0, y), (inner_sz - 1, y)], fill=(rv, gv, bv, 255))
    grad.putalpha(hex_mask)
    img.paste(grad, (stroke, stroke), grad)
    return img.resize((sz, sz), Image.LANCZOS)

for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sz = max(6, int(round(REF_ICON * scale)))
    out_dir = os.path.join(BASE_DIR, "assets", res_name, "pai")
    
    # Clean old assets
    if os.path.exists(out_dir):
        for f in os.listdir(out_dir):
            os.remove(os.path.join(out_dir, f))
    
    os.makedirs(out_dir, exist_ok=True)
    outline = max(1, int(round(3 * scale)))
    
    # Save only the unique color bgs
    for name, color in COLORS.items():
        icon = gen_hex(sz, outline, color)
        icon.save(os.path.join(out_dir, f"{name}.png"))

    print(f"{res_name}: 4 unique colors generated")

print("Done!")
