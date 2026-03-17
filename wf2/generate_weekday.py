#!/usr/bin/env python3
"""Generate weekday icons: gradient sphere with white letter and black outline."""

from PIL import Image, ImageDraw, ImageFont
import colorsys
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = "/System/Library/Fonts/SFNSRounded.ttf"

REF_SIZE = 480
REF_ICON = 36
REF_OUTLINE = 3

RESOLUTIONS = {
    "round": 480,
}

# day index 0=Mon, 1=Tue, ..., 6=Sun (ZeppOS IMG_WEEK uses Monday-first)
DAYS = [
    (0, "M", (70,  130, 220), (30,  70, 160)),  # Monday    - blue
    (1, "T", (80,  190, 210), (30, 110, 130)),  # Tuesday   - cyan
    (2, "W", (70,  180,  90), (30, 110,  50)),  # Wednesday - green
    (3, "T", (210, 175,  45), (130, 105, 20)),  # Thursday  - yellow
    (4, "F", (220, 115,  45), (140,  60, 20)),  # Friday    - orange
    (5, "S", (200,  60,  60), (120,  25, 25)),  # Saturday  - red
    (6, "S", (220,  50,  50), (130,  20, 20)),  # Sunday    - red
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
    for y in range(inner_start, inner_end + 1):
        t = (y - inner_start) / max(1, inner_end - inner_start)
        r = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        g = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        b = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        draw.line([(inner_start, y), (inner_end, y)], fill=(r, g, b, 255))
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


def gen_weekday(sz, outline, letter, color_top, color_bot):
    img = gradient_circle(sz, outline, color_top, color_bot)

    inner = sz - outline * 2
    font_size = int(inner * 0.9)
    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = font.getbbox(letter)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (sz - tw) // 2 - bbox[0]
    ty = (sz - th) // 2 - bbox[1]
    draw = ImageDraw.Draw(img)
    # Black stroke (2px = effectively 4px bigger letter), then white fill on top
    draw.text((tx, ty), letter, font=font, fill=(255, 255, 255, 255),
              stroke_width=2, stroke_fill=(0, 0, 0, 255))
    img = img.rotate(60, resample=Image.BICUBIC, expand=False)
    return img


def rgba_to_palette(rgba_img, max_colors=254):
    """Convert RGBA to palette PNG with per-index alpha, ZeppOS-compatible."""
    rgb_img = rgba_img.convert('RGB')
    q_img = rgb_img.quantize(colors=max_colors, dither=1)
    q_pal = q_img.getpalette()
    q_data = list(q_img.getdata())
    alpha_data = list(rgba_img.split()[3].getdata())

    # Compute per-palette-entry average alpha
    alpha_sums = [0] * max_colors
    alpha_counts = [0] * max_colors
    for qi, ai in zip(q_data, alpha_data):
        alpha_sums[qi] += ai
        alpha_counts[qi] += 1

    palette_alphas = []
    for j in range(max_colors):
        if alpha_counts[j] > 0:
            palette_alphas.append(alpha_sums[j] // alpha_counts[j])
        else:
            palette_alphas.append(255)

    # index 0 = transparent placeholder, indices 1..max_colors = actual colors
    new_pal = [0, 0, 0]
    for j in range(max_colors):
        new_pal.extend(q_pal[j * 3:j * 3 + 3])
    while len(new_pal) < 768:
        new_pal.append(0)

    new_data = []
    for qi, ai in zip(q_data, alpha_data):
        if ai < 10:
            new_data.append(0)  # transparent
        else:
            new_data.append(qi + 1)  # shift by 1

    result = Image.new('P', rgba_img.size)
    result.putpalette(new_pal)
    result.putdata(new_data)

    # tRNS: index 0 fully transparent, then per-palette average alphas
    tRNS = bytes([0] + palette_alphas)
    return result, tRNS


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sz = max(6, int(round(REF_ICON * scale)))
    outline = max(1, int(round(REF_OUTLINE * scale)))

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "weekday")
    os.makedirs(out_dir, exist_ok=True)

    for day_id, letter, color_top, color_bot in DAYS:
        rgba_icon = gen_weekday(sz, outline, letter, color_top, color_bot)
        pal_icon, tRNS = rgba_to_palette(rgba_icon)
        out_path = os.path.join(out_dir, str(day_id) + ".png")
        pal_icon.save(out_path, transparency=tRNS)

    print(res_name + ": 7 weekday icons " + str(sz) + "x" + str(sz))

print("Done!")
