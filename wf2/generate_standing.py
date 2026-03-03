#!/usr/bin/env python3
"""Generate standing (activity) icons: human silhouette colored by progress (5 levels), rotated toward center."""

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

# 5 progress levels: red → orange → yellow → light green → green
LEVELS = [
    (220, 50, 50),
    (240, 140, 40),
    (240, 200, 40),
    (80, 200, 80),
    (60, 180, 60),
]

# --- Draw silhouette at high resolution ---
up = 480
s = up / 96.0
cx = up // 2

_img = Image.new("RGBA", (up, up), (0, 0, 0, 0))
_draw = ImageDraw.Draw(_img)

# Head
_draw.ellipse([cx - int(12*s), int(6*s), cx + int(12*s), int(30*s)], fill=(0, 0, 0, 255))
# Neck
_draw.rectangle([cx - int(5*s), int(28*s), cx + int(5*s), int(34*s)], fill=(0, 0, 0, 255))
# Torso
_draw.polygon([
    (cx - int(24*s), int(34*s)), (cx + int(24*s), int(34*s)),
    (cx + int(18*s), int(60*s)), (cx - int(18*s), int(60*s)),
], fill=(0, 0, 0, 255))
# Hips
_draw.polygon([
    (cx - int(18*s), int(60*s)), (cx + int(18*s), int(60*s)),
    (cx + int(20*s), int(70*s)), (cx - int(20*s), int(70*s)),
], fill=(0, 0, 0, 255))
# Arms
_draw.rounded_rectangle([cx - int(32*s), int(34*s), cx - int(22*s), int(65*s)], radius=int(5*s), fill=(0, 0, 0, 255))
_draw.rounded_rectangle([cx + int(22*s), int(34*s), cx + int(32*s), int(65*s)], radius=int(5*s), fill=(0, 0, 0, 255))
# Legs
_draw.polygon([(cx - int(20*s), int(70*s)), (cx - int(4*s), int(70*s)), (cx - int(10*s), int(94*s)), (cx - int(26*s), int(94*s))], fill=(0, 0, 0, 255))
_draw.polygon([(cx + int(4*s), int(70*s)), (cx + int(20*s), int(70*s)), (cx + int(26*s), int(94*s)), (cx + int(10*s), int(94*s))], fill=(0, 0, 0, 255))

SRC = _img.resize((96, 96), Image.LANCZOS)


def colorize(img, color):
    r, g, b, a = img.split()
    r = r.point(lambda x: color[0])
    g = g.point(lambda x: color[1])
    b = b.point(lambda x: color[2])
    return Image.merge("RGBA", (r, g, b, a))


def gen_standing(sz, outline, color):
    up = 4
    big = sz * up
    stroke = 2 * up
    icon_sz = big - stroke * 2
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    icon = SRC.resize((icon_sz, icon_sz), Image.LANCZOS)
    # Black outline
    black_icon = colorize(icon, (0, 0, 0))
    for dx in range(-stroke, stroke + 1):
        for dy in range(-stroke, stroke + 1):
            if dx * dx + dy * dy <= stroke * stroke:
                img.paste(black_icon, (stroke + dx, stroke + dy), black_icon)
    # Gradient colored icon
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
    # Rotate 30° CCW so head points toward screen center (widget at hour 5)
    result = result.rotate(30, resample=Image.BICUBIC, expand=False)
    return result


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sz = max(6, int(round(REF_ICON * scale)))
    outline = max(1, int(round(REF_OUTLINE * scale)))

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "status", "standing")
    os.makedirs(out_dir, exist_ok=True)

    for i, color in enumerate(LEVELS):
        gen_standing(sz, outline, color).save(os.path.join(out_dir, str(i) + ".png"))

    gen_standing(sz, outline, (80, 80, 80)).save(os.path.join(out_dir, "gray.png"))

    print(res_name + ": 5+1 standing icons " + str(sz) + "x" + str(sz))

print("Done!")

