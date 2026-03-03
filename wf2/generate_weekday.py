#!/usr/bin/env python3
"""Generate weekday icons: one-letter day name in circle (white/red for weekends)."""

from PIL import Image, ImageDraw, ImageFont
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = "/tmp/VarelaRound-Regular.ttf"

REF_SIZE = 480
REF_ICON = 36
REF_OUTLINE = 3

RESOLUTIONS = {
    "round": 480,
    "466x466": 466,
    "454x454": 454,
    "416x416": 416,
    "390x450": 390,
    "360x360": 360,
    "320x380": 320,
}

# day index 0=Mon, 1=Tue, ..., 6=Sun (ZeppOS IMG_WEEK uses Monday-first)
DAYS = [
    (0, "M", False),  # Monday
    (1, "T", False),  # Tuesday
    (2, "W", False),  # Wednesday
    (3, "T", False),  # Thursday
    (4, "F", False),  # Friday
    (5, "S", True),   # Saturday - red
    (6, "S", True),   # Sunday - red
]


def gradient_circle(sz, outline, color_top, color_bot):
    """Draw a circle with vertical gradient fill."""
    up = 4
    big = sz * up
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([0, 0, big - 1, big - 1], fill=(0, 0, 0, 255))
    inner_start = outline * up
    inner_end = big - 1 - outline * up
    # Draw gradient line by line
    for y in range(inner_start, inner_end + 1):
        t = (y - inner_start) / max(1, inner_end - inner_start)
        r = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        g = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        b = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        draw.line([(inner_start, y), (inner_end, y)], fill=(r, g, b, 255))
    # Clip to circle
    mask = Image.new("L", (big, big), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse([inner_start, inner_start, inner_end, inner_end], fill=255)
    bg = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    bg_draw.ellipse([0, 0, big - 1, big - 1], fill=(0, 0, 0, 255))
    grad = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    grad.paste(img, mask=mask)
    bg.paste(grad, (0, 0), grad)
    return bg.resize((sz, sz), Image.LANCZOS)


def gen_weekday(sz, outline, letter, is_weekend):
    if is_weekend:
        color_top = (240, 80, 80)
        color_bot = (180, 30, 30)
    else:
        color_top = (200, 220, 255)
        color_bot = (80, 120, 220)
    img = gradient_circle(sz, outline, color_top, color_bot)

    inner = sz - outline * 2
    font_size = int(inner * 0.7)
    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = font.getbbox(letter)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (sz - tw) // 2 - bbox[0]
    ty = (sz - th) // 2 - bbox[1]
    text_color = (255, 255, 255, 255)
    stroke = max(1, outline // 2)
    draw = ImageDraw.Draw(img)
    draw.text((tx, ty), letter, font=font, fill=text_color, stroke_width=stroke, stroke_fill=text_color)
    img = img.rotate(60, resample=Image.BICUBIC, expand=False)
    return img


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sz = max(6, int(round(REF_ICON * scale)))
    outline = max(1, int(round(REF_OUTLINE * scale)))

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "weekday")
    os.makedirs(out_dir, exist_ok=True)

    for day_id, letter, is_weekend in DAYS:
        icon = gen_weekday(sz, outline, letter, is_weekend)
        icon.save(os.path.join(out_dir, str(day_id) + ".png"))

    print(res_name + ": 7 weekday icons " + str(sz) + "x" + str(sz))

print("Done!")
