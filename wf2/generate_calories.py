#!/usr/bin/env python3
"""Generate calorie icons: flame colored by progress (5 levels)."""

from PIL import Image, ImageDraw
import os
from gradient_utils import lighten, darken

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

REF_SIZE = 480
REF_ICON = 36
REF_OUTLINE = 3

RESOLUTIONS = {
    "480x480": 480,
    "466x466": 466,
    "454x454": 454,
    "416x416": 416,
    "390x450": 390,
    "360x360": 360,
    "320x380": 320,
}

SRC = Image.open("/tmp/flame_icon.png").convert("RGBA")

# 5 progress levels: red -> orange -> yellow -> light green -> green
LEVELS = [
    (220, 50, 50),
    (240, 140, 40),
    (240, 200, 40),
    (80, 200, 80),
    (60, 180, 60),
]


def colorize(img, color):
    r, g, b, a = img.split()
    r = r.point(lambda x: color[0])
    g = g.point(lambda x: color[1])
    b = b.point(lambda x: color[2])
    return Image.merge("RGBA", (r, g, b, a))


def gen_cal(sz, outline, color):
    up = 4
    big = sz * up
    stroke = 2 * up
    icon_sz = big - stroke * 2
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    icon = SRC.resize((icon_sz, icon_sz), Image.LANCZOS)
    # Black outline by stamping
    black_icon = colorize(icon, (0, 0, 0))
    for dx in range(-stroke, stroke + 1):
        for dy in range(-stroke, stroke + 1):
            if dx * dx + dy * dy <= stroke * stroke:
                img.paste(black_icon, (stroke + dx, stroke + dy), black_icon)
    # Draw gradient-colored icon on top
    color_top = lighten(color, 0.3)
    color_bot = darken(color, 0.3)
    grad = Image.new("RGBA", (icon_sz, icon_sz), (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(grad)
    for y in range(icon_sz):
        t = y / max(1, icon_sz - 1)
        rv = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        gv = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        bv = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        grad_draw.line([(0, y), (icon_sz - 1, y)], fill=(rv, gv, bv, 255))
    alpha = icon.split()[3]
    grad.putalpha(alpha)
    img.paste(grad, (stroke, stroke), grad)
    result = img.resize((sz, sz), Image.LANCZOS)
    result = result.rotate(60, resample=Image.BICUBIC, expand=False)
    return result


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sz = max(6, int(round(REF_ICON * scale)))
    outline = max(1, int(round(REF_OUTLINE * scale)))

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "calories")
    os.makedirs(out_dir, exist_ok=True)

    for i, color in enumerate(LEVELS):
        icon = gen_cal(sz, outline, color)
        icon.save(os.path.join(out_dir, str(i) + ".png"))

    gray = gen_cal(sz, outline, (80, 80, 80))
    gray.save(os.path.join(out_dir, "gray.png"))

    print(res_name + ": 5+1 calorie icons " + str(sz) + "x" + str(sz))

print("Done!")
