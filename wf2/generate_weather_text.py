#!/usr/bin/env python3
import os
from PIL import Image, ImageDraw, ImageFont
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

RESOLUTIONS = {
    "480x480": 480,
    "466x466": 466,
    "454x454": 454,
    "416x416": 416,
    "390x450": 390,
    "360x360": 360,
    "320x380": 320,
}

WEATHER = [
  'Cloudy','Showers','Snow','Sunny','Overcast',
  'Lt Rain','Lt Snow','Rain','Mod Snow','Rain',
  'Snow','Blizzard','Foggy','Hazy','Sand',
  'Windy','Storms','Storm','Tornado','Sleet',
  'Dusty','Sand','Fog','Cloudy','Cloudy',
  'Fzn Rain','Rime','','',
]

WEEKDAYS = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
]

MONTHS = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
]

REF_SIZE = 480
REF_DIGIT_H = 24
OUTLINE_W = 1

def generate_text_image(text, font_size, outline, specific_font=None, fixed_height=None):
    if not text: return Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    curr_font_path = specific_font if specific_font else FONT_PATH
    font = ImageFont.truetype(curr_font_path, font_size)
    bbox = font.getbbox(text)
    pad = outline + 1
    w = max(8, bbox[2] - bbox[0] + pad * 2)
    h = max(8, bbox[3] - bbox[1] + pad * 2)
    canvas_h = fixed_height if fixed_height else h
    img = Image.new("RGBA", (w, canvas_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    ox = -bbox[0] + pad
    if fixed_height: oy = fixed_height - (bbox[3] - bbox[1]) - pad
    else: oy = -bbox[1] + pad
    for dx in range(-outline, outline + 1):
        for dy in range(-outline, outline + 1):
            if dx == 0 and dy == 0: continue
            draw.text((ox + dx, oy + dy), text, font=font, fill=(0, 0, 0, 255))
    draw.text((ox, oy), text, font=font, fill=(255, 255, 255, 255))
    return img

def find_font_size(target_h):
    lo, hi = 6, 200
    while lo < hi:
        mid = (lo + hi) // 2
        font = ImageFont.truetype(FONT_PATH, mid)
        bbox = font.getbbox("A")
        h = bbox[3] - bbox[1]
        if h < target_h: lo = mid + 1
        else: hi = mid
    return lo

for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    digit_h = max(10, int(round(REF_DIGIT_H * scale)))
    outline = 1
    font_size = find_font_size(digit_h)
    widths_info = {"weather": [], "week": [], "month": [], "special": {}}
    ref_month = generate_text_image("JAN", font_size, outline)
    target_h = ref_month.height
    out_dir = os.path.join(BASE_DIR, "assets", res_name, "weather")
    os.makedirs(out_dir, exist_ok=True)
    for i, text in enumerate(WEATHER):
        img = generate_text_image(text, font_size, outline)
        img.save(os.path.join(out_dir, f"{i}.png"))
        widths_info["weather"].append(img.width)
    out_dir = os.path.join(BASE_DIR, "assets", res_name, "glance-week")
    os.makedirs(out_dir, exist_ok=True)
    for i, text in enumerate(WEEKDAYS):
        img = generate_text_image(text, font_size, outline)
        img.save(os.path.join(out_dir, f"{i}.png"))
        widths_info["week"].append(img.width)
    out_dir = os.path.join(BASE_DIR, "assets", res_name, "glance-month")
    os.makedirs(out_dir, exist_ok=True)
    for i, text in enumerate(MONTHS):
        img = generate_text_image(text + ",", font_size, outline)
        img.save(os.path.join(out_dir, f"{i}.png"))
        widths_info["month"].append(img.width)
    special_chars = {"|": "pipe", ",": "comma", ":": "colon", "\u00B0": "degree", "\u00B7": "dot"}
    glance_dir = os.path.join(BASE_DIR, "assets", res_name, "glance")
    for char, name in special_chars.items():
        fh = target_h if name == "comma" else None
        img = generate_text_image(char, font_size, outline, fixed_height=fh)
        img.save(os.path.join(glance_dir, f"{name}.png"))
        widths_info["special"][name] = img.width
    alarm_font = "/System/Library/Fonts/Menlo.ttc"
    if not os.path.exists(alarm_font): alarm_font = FONT_PATH
    img = generate_text_image("\u23F2", font_size + 2, outline, specific_font=alarm_font)
    img.save(os.path.join(glance_dir, "alarm_ico.png"))
    widths_info["special"]["alarm_ico"] = img.width
    with open(os.path.join(glance_dir, "word_widths.json"), "w") as f:
        json.dump(widths_info, f)
    print(f"{res_name}: Generated word images (digit_h={digit_h})")
print("Done!")
