#!/usr/bin/env python3
"""Generate weather condition icons (36x36 round, matching status icon style)."""

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

# Source icons
SRC = {
    "sunny": "/tmp/weather_sunny.png",
    "cloud": "/tmp/weather_cloud.png",
    "thunder": "/tmp/weather_thunder.png",
    "rain": "/tmp/weather_rain.png",
    "snow": "/tmp/weather_snow.png",
    "fog": "/tmp/weather_fog.png",
    "night": "/tmp/weather_night.png",
    "wind": "/tmp/weather_wind.png",
}

# Colors per weather type
WEATHER_COLORS = {
    "sunny":   (240, 200, 40),   # warm yellow
    "cloud":   (160, 170, 180),  # gray
    "thunder": (180, 100, 220),  # purple
    "rain":    (60, 130, 220),   # blue
    "snow":    (180, 220, 255),  # light blue
    "fog":     (140, 140, 140),  # dark gray
    "night":   (240, 230, 140),  # pale yellow (moonlight)
    "wind":    (100, 200, 180),  # teal
}

# ZeppOS weather conditions 0-28 mapped to icon keys
CONDITION_MAP = {
    0: "cloud",        # Cloudy
    1: "rain",         # Showers
    2: "snow",         # Snow Showers
    3: "sunny",        # Sunny
    4: "cloud",        # Overcast
    5: "rain",         # Light Rain
    6: "snow",         # Light Snow
    7: "rain",         # Moderate Rain
    8: "snow",         # Moderate Snow
    9: "snow",         # Heavy Snow
    10: "rain",        # Heavy Rain
    11: "fog",         # Sandstorm
    12: "snow",        # Rain and Snow
    13: "fog",         # Fog
    14: "fog",         # Hazy
    15: "thunder",     # T-Storms
    16: "snow",        # Snowstorm
    17: "fog",         # Floating dust
    18: "rain",        # Very Heavy Rainstorm
    19: "rain",        # Rain and Hail
    20: "thunder",     # T-Storms and Hail
    21: "rain",        # Heavy Rainstorm
    22: "fog",         # Dust
    23: "fog",         # Heavy sand storm
    24: "rain",        # Rainstorm
    25: "cloud",       # Unknown
    26: "night",       # Cloudy Nighttime
    27: "night",       # Showers Nighttime
    28: "night",       # Sunny Nighttime
}


def colorize(img, color):
    r, g, b, a = img.split()
    r = r.point(lambda x: color[0])
    g = g.point(lambda x: color[1])
    b = b.point(lambda x: color[2])
    return Image.merge("RGBA", (r, g, b, a))


def gen_weather(sz, outline, src_img, color):
    up = 4
    big = sz * up
    stroke = 2 * up
    icon_sz = big - stroke * 2
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    icon = src_img.resize((icon_sz, icon_sz), Image.LANCZOS)
    # Black outline by stamping
    black_icon = colorize(icon, (0, 0, 0))
    for dx in range(-stroke, stroke + 1):
        for dy in range(-stroke, stroke + 1):
            if dx * dx + dy * dy <= stroke * stroke:
                img.paste(black_icon, (stroke + dx, stroke + dy), black_icon)
    # Gradient-colored icon on top
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
    return img.resize((sz, sz), Image.LANCZOS).rotate(30, resample=Image.BICUBIC, expand=False)


# Load source images once
sources = {}
for key, path in SRC.items():
    sources[key] = Image.open(path).convert("RGBA")

for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sz = max(6, int(round(REF_ICON * scale)))
    outline = max(1, int(round(REF_OUTLINE * scale)))

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "weather-icons")
    os.makedirs(out_dir, exist_ok=True)

    for condition_id in range(29):
        key = CONDITION_MAP.get(condition_id, "cloud")
        color = WEATHER_COLORS[key]
        icon = gen_weather(sz, outline, sources[key], color)
        icon.save(os.path.join(out_dir, str(condition_id) + ".png"))

    print(res_name + ": 29 weather icons " + str(sz) + "x" + str(sz))

print("Done!")
