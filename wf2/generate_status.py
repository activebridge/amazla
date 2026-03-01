#!/usr/bin/env python3
"""Generate status icon PNGs from Google Material Icons, resized for each resolution."""

from PIL import Image, ImageDraw, ImageOps
import math
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

ICONS = {
    "alarm.png": None,
    "disconnect.png": "/tmp/disconnect_icon.png",
    "dnd.png": "/tmp/dnd_icon.png",
    "lock.png": "/tmp/lock_icon.png",
}


def invert_to_white(img):
    r, g, b, a = img.split()
    r = r.point(lambda x: 255)
    g = g.point(lambda x: 255)
    b = b.point(lambda x: 255)
    return Image.merge("RGBA", (r, g, b, a))


def colorize(img, color):
    r, g, b, a = img.split()
    r = r.point(lambda x: color[0])
    g = g.point(lambda x: color[1])
    b = b.point(lambda x: color[2])
    return Image.merge("RGBA", (r, g, b, a))


def make_icon(sz, outline, fill_color, content_fn):
    """Make icon: black outline circle + fill circle + content."""
    img = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Black outline circle (full size)
    draw.ellipse([0, 0, sz - 1, sz - 1], fill=(0, 0, 0, 255))
    # Fill circle (inset by outline)
    draw.ellipse([outline, outline, sz - 1 - outline, sz - 1 - outline], fill=fill_color)
    # Draw content
    content_fn(img, draw, sz, outline)
    return img


def make_alarm(sz, outline, alarm_color=(60, 130, 220)):
    """Minimal clock: white circle with two hands on black circle."""
    up = 4
    big = sz * up
    stroke = 2 * up
    inner_sz = big - stroke * 2

    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([0, 0, big - 1, big - 1], fill=(0, 0, 0, 255))

    clock_r = inner_sz // 2
    cx = stroke + clock_r
    cy = stroke + clock_r
    color_top = lighten(alarm_color, 0.3)
    color_bot = darken(alarm_color, 0.3)
    grad = Image.new("RGBA", (inner_sz, inner_sz), (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(grad)
    for y in range(inner_sz):
        t = y / max(1, inner_sz - 1)
        rv = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        gv = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        bv = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        grad_draw.line([(0, y), (inner_sz - 1, y)], fill=(rv, gv, bv, 255))
    mask = Image.new("L", (inner_sz, inner_sz), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse([0, 0, inner_sz - 1, inner_sz - 1], fill=255)
    face = Image.new("RGBA", (inner_sz, inner_sz), (0, 0, 0, 0))
    face.paste(grad, mask=mask)
    img.paste(face, (stroke, stroke), face)

    # Two hands (black, rounded caps)
    hw = max(3, up * 3)
    # Hour hand: 10 o'clock (-60 deg from 12)
    ha = math.radians(-60 - 90)
    hlen = int(clock_r * 0.5)
    hx = cx + int(hlen * math.cos(ha))
    hy = cy + int(hlen * math.sin(ha))
    draw.line([(cx, cy), (hx, hy)], fill=(0, 0, 0, 255), width=hw)
    draw.ellipse([hx - hw // 2, hy - hw // 2, hx + hw // 2, hy + hw // 2], fill=(0, 0, 0, 255))
    # Minute hand: 12 o'clock
    ma = math.radians(-90)
    mlen = int(clock_r * 0.75)
    mx = cx + int(mlen * math.cos(ma))
    my = cy + int(mlen * math.sin(ma))
    draw.line([(cx, cy), (mx, my)], fill=(0, 0, 0, 255), width=hw)
    draw.ellipse([mx - hw // 2, my - hw // 2, mx + hw // 2, my + hw // 2], fill=(0, 0, 0, 255))

    # Center dot
    cd = max(2, up)
    draw.ellipse([cx - cd, cy - cd, cx + cd, cy + cd], fill=(0, 0, 0, 255))

    return img.resize((sz, sz), Image.LANCZOS)


def make_material_icon(sz, outline, src_path, bg_color, icon_color_fn=invert_to_white):
    def content(img, draw, sz, outline):
        src = Image.open(src_path).convert("RGBA")
        inner = sz - outline * 2
        icon_sz = max(6, int(inner * 0.85))
        colored = icon_color_fn(src).resize((icon_sz, icon_sz), Image.LANCZOS)
        offset = (sz - icon_sz) // 2
        img.paste(colored, (offset, offset), colored)

    return make_icon(sz, outline, bg_color, content)


def make_heart_icon(sz, outline, src_path, heart_color):
    def color_fn(img):
        return colorize(img, heart_color)

    return make_icon(sz, outline, (0, 0, 0, 255), lambda img, draw, sz, outline: (
        img.paste(
            (lambda colored, offset: (img.paste(colored, (offset, offset), colored), None)[1])(
                colorize(Image.open(src_path).convert("RGBA"), heart_color).resize(
                    (max(6, int((sz - outline * 2) * 0.70)),) * 2, Image.LANCZOS),
                (sz - max(6, int((sz - outline * 2) * 0.70))) // 2
            )
        )
    ))


# Heart icon - colored directly, no background, 2px black outline
def gen_heart(sz, outline, heart_color):
    src = Image.open("/tmp/heart_icon.png").convert("RGBA")
    up = 4
    big = sz * up
    stroke = 2 * up
    icon_sz = big - stroke * 2
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    icon = src.resize((icon_sz, icon_sz), Image.LANCZOS)
    # Black outline by stamping
    black_icon = colorize(icon, (0, 0, 0))
    for dx in range(-stroke, stroke + 1):
        for dy in range(-stroke, stroke + 1):
            if dx * dx + dy * dy <= stroke * stroke:
                img.paste(black_icon, (stroke + dx, stroke + dy), black_icon)
    # Draw gradient-colored icon on top
    color_top = lighten(heart_color, 0.3)
    color_bot = darken(heart_color, 0.3)
    grad = Image.new("RGBA", (icon_sz, icon_sz), (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(grad)
    for y in range(icon_sz):
        t = y / max(1, icon_sz - 1)
        rv = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        gv = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        bv = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        grad_draw.line([(0, y), (icon_sz - 1, y)], fill=(rv, gv, bv, 255))
    # Mask gradient to icon shape
    alpha = icon.split()[3]
    grad.putalpha(alpha)
    img.paste(grad, (stroke, stroke), grad)
    return img.resize((sz, sz), Image.LANCZOS)


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sz = max(6, int(round(REF_ICON * scale)))
    outline = max(1, int(round(REF_OUTLINE * scale)))

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "status")
    os.makedirs(out_dir, exist_ok=True)

    for fname, src_path in ICONS.items():
        if fname == "alarm.png":
            icon = make_alarm(sz, outline)
        elif fname == "disconnect.png":
            icon = make_material_icon(sz, outline, src_path, (220, 50, 50, 255))
        else:
            icon = make_material_icon(sz, outline, src_path, (0, 0, 0, 255))

        out_path = os.path.join(out_dir, fname)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        icon.save(out_path)

    gray_alarm = make_alarm(sz, outline, (80, 80, 80))
    gray_alarm.save(os.path.join(out_dir, "alarm_gray.png"))

    print(res_name + ": " + str(sz) + "x" + str(sz) + " outline=" + str(outline))

# Generate 5 heart rate zone icons
HEART_ZONES = [
    (0, (120, 120, 120)),  # gray (no data)
    (1, (80, 140, 220)),   # blue (resting <60)
    (2, (80, 200, 80)),    # green (normal 60-99)
    (3, (240, 200, 40)),   # yellow (elevated 100-139)
    (4, (240, 140, 40)),   # orange (high 140-169)
    (5, (220, 50, 50)),    # red (very high 170+)
]

for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sz = max(6, int(round(REF_ICON * scale)))
    outline = max(1, int(round(REF_OUTLINE * scale)))

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "status", "heart")
    os.makedirs(out_dir, exist_ok=True)

    for zone_id, color in HEART_ZONES:
        icon = gen_heart(sz, outline, color)
        icon.save(os.path.join(out_dir, str(zone_id) + ".png"))

    print(res_name + ": 5 heart icons")

print("Done!")
