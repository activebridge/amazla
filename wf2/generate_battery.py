#!/usr/bin/env python3
"""Generate battery assets: colored circle bgs (5 levels) + white outlined digit font."""

from PIL import Image, ImageDraw, ImageFont
import os
from gradient_utils import lighten, darken

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = "/tmp/VarelaRound-Regular.ttf"

REF_SIZE = 480
REF_ICON = 36
REF_OUTLINE = 3

RESOLUTIONS = {
    "round": 480,
}

# 5 battery levels: red → orange → yellow → light green → green
LEVELS = [
    (220, 50, 50),     # 0-20%  red
    (240, 140, 40),    # 20-40% orange
    (240, 200, 40),    # 40-60% yellow
    (80, 200, 80),     # 60-80% green
    (60, 180, 60),     # 80-100% green
]


BOLT_SRC = Image.open("/tmp/bolt_icon.png").convert("RGBA")


def colorize(img, color):
    r, g, b, a = img.split()
    r = r.point(lambda x: color[0])
    g = g.point(lambda x: color[1])
    b = b.point(lambda x: color[2])
    return Image.merge("RGBA", (r, g, b, a))


def gen_circle(sz, outline, color):
    up = 4
    big = sz * up
    stroke = 2 * up
    icon_sz = big - stroke * 2
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    icon = BOLT_SRC.resize((icon_sz, icon_sz), Image.LANCZOS)
    # Black outline by stamping
    black_icon = colorize(icon, (0, 0, 0))
    for dx in range(-stroke, stroke + 1):
        for dy in range(-stroke, stroke + 1):
            if dx * dx + dy * dy <= stroke * stroke:
                img.paste(black_icon, (stroke + dx, stroke + dy), black_icon)
    # Draw gradient-colored bolt on top
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
    result = result.rotate(-30, resample=Image.BICUBIC, expand=False)
    return result


def gen_digit(char, font_size, outline):
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
            if dx == 0 and dy == 0:
                continue
            draw.text((ox + dx, oy + dy), char, font=font, fill=(0, 0, 0, 255))
    draw.text((ox, oy), char, font=font, fill=(255, 255, 255, 255))
    return img


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sz = max(6, int(round(REF_ICON * scale)))
    outline = max(1, int(round(REF_OUTLINE * scale)))

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "battery")
    os.makedirs(out_dir, exist_ok=True)

    # 5 colored circle backgrounds
    for i, color in enumerate(LEVELS):
        circle = gen_circle(sz, outline, color)
        circle.save(os.path.join(out_dir, str(i) + ".png"))

    # Digit font (white with black outline)
    inner = sz - outline * 2
    font_size = int(inner * 0.55)
    digit_outline = max(1, outline // 2)
    for d in range(10):
        digit = gen_digit(str(d), font_size, digit_outline)
        digit.save(os.path.join(out_dir, "font_" + str(d) + ".png"))

    sample = gen_digit("0", font_size, digit_outline)
    print(res_name + ": 5 bgs + 10 digits, " + str(sz) + "x" + str(sz) + " digit=" + str(sample.size))

print("Done!")
