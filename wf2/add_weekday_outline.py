#!/usr/bin/env python3
"""Add 2px black outline around white letter pixels in weekday icons.
   Modifies pixel indices only — palette structure and transparency are preserved."""

from PIL import Image
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEEKDAY_DIR = os.path.join(BASE_DIR, "assets", "round", "weekday")
RADIUS = 2


def find_black_opaque_index(pal, n_colors, trans_bytes, used_indices):
    """Find an unused palette entry that is near-black with alpha >= 250."""
    for j in range(n_colors):
        r, g, b = pal[j*3], pal[j*3+1], pal[j*3+2]
        a = trans_bytes[j] if j < len(trans_bytes) else 255
        if r < 10 and g < 10 and b < 10 and a >= 250 and j not in used_indices:
            return j
    return None


for day_id in range(7):
    path = os.path.join(WEEKDAY_DIR, f"{day_id}.png")
    img = Image.open(path)
    assert img.mode == 'P', f"{day_id}.png is not palette mode"

    pal = img.getpalette()
    n_colors = len(pal) // 3
    trans = img.info.get('transparency', b'')
    trans_bytes = trans if isinstance(trans, bytes) else bytes([trans])

    pixel_data = list(img.getdata())
    w, h = img.size

    # Convert to RGBA to identify pixel types by color
    rgba = img.convert('RGBA')
    rgba_data = list(rgba.getdata())

    # Build masks
    white_pos = set()
    transparent_pos = set()
    for idx, (r, g, b, a) in enumerate(rgba_data):
        x, y = idx % w, idx // w
        if a < 30:
            transparent_pos.add((x, y))
        elif r > 200 and g > 200 and b > 200:
            white_pos.add((x, y))

    # 2px dilation of white pixels → outline candidates
    outline_pos = set()
    for (px, py) in white_pos:
        for dy in range(-RADIUS, RADIUS + 1):
            for dx in range(-RADIUS, RADIUS + 1):
                if dx*dx + dy*dy <= RADIUS*RADIUS:
                    nx, ny = px + dx, py + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        outline_pos.add((nx, ny))

    # Remove white and transparent from outline
    outline_pos -= white_pos
    outline_pos -= transparent_pos

    if not outline_pos:
        print(f"{day_id}.png: no outline pixels found, skipping")
        continue

    # Find unused black opaque palette index
    used_indices = set(pixel_data)
    black_idx = find_black_opaque_index(pal, n_colors, trans_bytes, used_indices)
    if black_idx is None:
        print(f"{day_id}.png: no unused black index found!")
        continue

    # Apply outline: change pixel indices at outline positions
    pixel_data = list(pixel_data)
    for (px, py) in outline_pos:
        pixel_data[py * w + px] = black_idx

    img.putdata(pixel_data)
    img.save(path, transparency=trans)
    print(f"{day_id}.png: {len(outline_pos)} outline pixels added (black index={black_idx})")

print("Done!")
