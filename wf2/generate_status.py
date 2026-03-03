#!/usr/bin/env python3
"""Generate status icons including a truly curved top-side disconnect bar."""

from PIL import Image, ImageDraw, ImageOps
import math
import os
from gradient_utils import lighten, darken

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

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

ICONS = {
    "alarm.png": None,
    "disconnect.png": "/tmp/disconnect_icon.png",
    "dnd.png": "/tmp/dnd_icon.png",
    "lock.png": "/tmp/lock_icon.png",
}

RED = (220, 50, 50)

def colorize(img, color):
    r, g, b, a = img.split()
    r = r.point(lambda x: color[0])
    g = g.point(lambda x: color[1])
    b = b.point(lambda x: color[2])
    return Image.merge("RGBA", (r, g, b, a))

def make_icon(sz, outline, fill_color, content_fn):
    img = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([0, 0, sz - 1, sz - 1], fill=(0, 0, 0, 255))
    draw.ellipse([outline, outline, sz - 1 - outline, sz - 1 - outline], fill=fill_color)
    content_fn(img, draw, sz, outline)
    return img

def make_alarm(sz, outline, alarm_color=(60, 130, 220)):
    up = 4
    big = sz * up
    stroke = 2 * up
    inner_sz = big - stroke * 2
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([0, 0, big - 1, big - 1], fill=(0, 0, 0, 255))
    color_top, color_bot = lighten(alarm_color, 0.3), darken(alarm_color, 0.3)
    grad = Image.new("RGBA", (inner_sz, inner_sz), (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(grad)
    for y in range(inner_sz):
        t = y / max(1, inner_sz - 1)
        rv = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        gv = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        bv = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        grad_draw.line([(0, y), (inner_sz - 1, y)], fill=(rv, gv, bv, 255))
    mask = Image.new("L", (inner_sz, inner_sz), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, inner_sz - 1, inner_sz - 1], fill=255)
    face = Image.new("RGBA", (inner_sz, inner_sz), (0, 0, 0, 0))
    face.paste(grad, mask=mask)
    img.paste(face, (stroke, stroke), face)
    hw = max(3, up * 3)
    cx, cy = big//2, big//2
    ha, ma = math.radians(-150), math.radians(-90)
    draw.line([(cx, cy), (cx + int(inner_sz*0.25*math.cos(ha)), cy + int(inner_sz*0.25*math.sin(ha)))], fill=(0,0,0,255), width=hw)
    draw.line([(cx, cy), (cx + int(inner_sz*0.35*math.cos(ma)), cy + int(inner_sz*0.35*math.sin(ma)))], fill=(0,0,0,255), width=hw)
    return img.resize((sz, sz), Image.LANCZOS)

def make_material_icon(sz, outline, src_path, bg_color):
    def content(img, draw, sz, outline):
        src = Image.open(src_path).convert("RGBA")
        inner = sz - outline * 2
        icon_sz = max(6, int(inner * 0.85))
        colored = colorize(src, (255, 255, 255)).resize((icon_sz, icon_sz), Image.LANCZOS)
        img.paste(colored, ((sz - icon_sz) // 2, (sz - icon_sz) // 2), colored)
    return make_icon(sz, outline, bg_color, content)

def gen_large_disconnect(screen_w):
    """Generate a top red crescent with 20px smaller radius and L->R gradient."""
    sw = screen_w 
    # 20px smaller radius (240 -> 220 for 480px screen)
    r = int((sw / 2 - 20) if sw >= 480 else (sw / 2 - (20 * sw / 480)))
    
    canvas_w = sw
    canvas_h = sw // 4
    
    img = Image.new("RGBA", (sw, sw), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Position circle so its bottom edge is at canvas_h
    cx = sw // 2
    cy = canvas_h - r
    stroke = 10
    
    # Black outline circle
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0, 0, 0, 255))
    
    # Left-to-Right Red Gradient
    color_l, color_r = lighten(RED, 0.3), darken(RED, 0.3)
    grad = Image.new("RGBA", (sw, sw), (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(grad)
    for x in range(sw):
        t = x / max(1, sw - 1)
        rv = int(color_l[0] + (color_r[0] - color_l[0]) * t)
        gv = int(color_l[1] + (color_r[1] - color_l[1]) * t)
        bv = int(color_l[2] + (color_r[2] - color_l[2]) * t)
        grad_draw.line([(x, 0), (x, sw - 1)], fill=(rv, gv, bv, 255))
    
    mask = Image.new("L", (sw, sw), 0)
    ImageDraw.Draw(mask).ellipse([cx - r + stroke, cy - r + stroke, cx + r - stroke, cy + r - stroke], fill=255)
    
    bar_fill = Image.new("RGBA", (sw, sw), (0, 0, 0, 0))
    bar_fill.paste(grad, mask=mask)
    img.paste(bar_fill, (0, 0), bar_fill)
    
    # Bluetooth icon
    src = Image.open("/tmp/disconnect_icon.png").convert("RGBA")
    icon_sz = int(sw * 0.08)
    colored = colorize(src, (255, 255, 255)).resize((icon_sz, icon_sz), Image.LANCZOS)
    ico_outline = 2
    ico_canvas_sz = icon_sz + ico_outline * 2
    ico_img = Image.new("RGBA", (ico_canvas_sz, ico_canvas_sz), (0, 0, 0, 0))
    black_ico = colorize(src.resize((icon_sz, icon_sz), Image.LANCZOS), (0, 0, 0))
    for dx in range(-ico_outline, ico_outline + 1):
        for dy in range(-ico_outline, ico_outline + 1):
            ico_img.paste(black_ico, (ico_outline + dx, ico_outline + dy), black_ico)
    ico_img.paste(colored, (ico_outline, ico_outline), colored)
    img.paste(ico_img, (cx - ico_canvas_sz//2, canvas_h - ico_canvas_sz - int(sw * 0.02)), ico_img)
    
    return img.crop((0, 0, sw, canvas_h))

for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sz = max(6, int(round(REF_ICON * scale)))
    outline = max(1, int(round(REF_OUTLINE * scale)))
    out_dir = os.path.join(BASE_DIR, "assets", res_name, "status")
    os.makedirs(out_dir, exist_ok=True)

    for fname, src_path in ICONS.items():
        if fname == "alarm.png": icon = make_alarm(sz, outline)
        elif fname == "disconnect.png": icon = make_material_icon(sz, outline, src_path, RED)
        else: icon = make_material_icon(sz, outline, src_path, (0, 0, 0, 255))
        icon.save(os.path.join(out_dir, fname))

    large_disc = gen_large_disconnect(res_width)
    large_disc.save(os.path.join(out_dir, "disconnect_large.png"))

print("Done!")
