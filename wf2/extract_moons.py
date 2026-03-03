#!/usr/bin/env python3
"""Extract 29 moon phase icons from reference image, crop to circles, resize per resolution."""

from PIL import Image, ImageDraw
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_PATH = "/tmp/moon_phases_ref.png"

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

# Load and convert to RGBA
src = Image.open(SRC_PATH).convert("RGBA")
w, h = src.size
print("Source: " + str(w) + "x" + str(h))

# Find icon bounding boxes by scanning for non-background pixels
# Background is light gray (~230,230,230)
pixels = src.load()

def is_icon_pixel(x, y):
    r, g, b, a = pixels[x, y]
    # Background is light gray > 220
    return r < 200 or g < 200 or b < 200

# Scan columns to find icon boundaries
def find_icons_in_row(y_start, y_end):
    icons = []
    in_icon = False
    x_start = 0
    for x in range(w):
        has_pixel = False
        for y in range(y_start, y_end):
            if is_icon_pixel(x, y):
                has_pixel = True
                break
        if has_pixel and not in_icon:
            x_start = x
            in_icon = True
        elif not has_pixel and in_icon:
            if x - x_start > 20:  # min icon width
                icons.append((x_start, x))
            in_icon = False
    if in_icon:
        icons.append((x_start, w))
    return icons

# Find row boundaries by scanning rows
row_ranges = []
in_row = False
y_start = 0
for y in range(h):
    has_pixel = False
    for x in range(w):
        if is_icon_pixel(x, y):
            has_pixel = True
            break
    if has_pixel and not in_row:
        y_start = y
        in_row = True
    elif not has_pixel and in_row:
        if y - y_start > 20:
            row_ranges.append((y_start, y))
        in_row = False
if in_row:
    row_ranges.append((y_start, h))

print("Found " + str(len(row_ranges)) + " rows")

# Extract all icons
all_icons = []
for ry_start, ry_end in row_ranges:
    cols = find_icons_in_row(ry_start, ry_end)
    print("  Row " + str(ry_start) + "-" + str(ry_end) + ": " + str(len(cols)) + " icons")
    for cx_start, cx_end in cols:
        # Crop the icon
        icon = src.crop((cx_start, ry_start, cx_end, ry_end))
        all_icons.append(icon)

print("Total icons: " + str(len(all_icons)))


def make_circular(icon, sz, outline):
    """Resize icon to circle with black outline."""
    # Make square first
    iw, ih = icon.size
    side = max(iw, ih)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(icon, ((side - iw) // 2, (side - ih) // 2))

    # Resize to target
    resized = square.resize((sz, sz), Image.LANCZOS)

    # Create circular mask
    result = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
    draw = ImageDraw.Draw(result)

    # Black outline circle
    draw.ellipse([0, 0, sz - 1, sz - 1], fill=(0, 0, 0, 255))

    # Paste moon inside circle (inset by outline)
    inner = sz - outline * 2
    moon_resized = square.resize((inner, inner), Image.LANCZOS)

    # Create circular mask for inner
    mask = Image.new("L", (inner, inner), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse([0, 0, inner - 1, inner - 1], fill=255)

    result.paste(moon_resized, (outline, outline), mask)
    return result


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sz = max(6, int(round(REF_ICON * scale)))
    outline = max(1, int(round(REF_OUTLINE * scale)))

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "date")
    os.makedirs(out_dir, exist_ok=True)

    for i, icon in enumerate(all_icons):
        circular = make_circular(icon, sz, outline)
        circular.save(os.path.join(out_dir, "moon_" + str(i) + ".png"))

    print(res_name + ": " + str(len(all_icons)) + " moon icons " + str(sz) + "x" + str(sz))

print("Done!")
