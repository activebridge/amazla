#!/usr/bin/env python3
"""Generate pointer PNGs for seconds, minute, and hour hands."""

from PIL import Image, ImageDraw
import math
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

REF_SIZE = 480
SECOND_W, SECOND_H = 16, 260
MINUTE_PIVOT_Y = 170            # pivot at screen center (reference)
MINUTE_TAIL = 24                # 10% tail crossing center
MINUTE_H = MINUTE_PIVOT_Y + MINUTE_TAIL  # total image height
MINUTE_BLOB_D = 72              # blob diameter at tip (4x original 18)
MINUTE_LINE_W = 8               # line width
MINUTE_CIRCLE_R = 10            # center circle radius
MINUTE_HOLE_R   = 3             # hole radius in center circle

HOUR_PIVOT_Y = 85               # 2x shorter than minute
HOUR_TAIL    = 12               # 2x shorter tail
HOUR_LINE_W  = 16               # 2x thicker than minute
HOUR_COLOR   = ((255, 160, 40), (180, 80, 10), (200, 100, 20))  # orange gradient TOP/BOT/TAIL

RESOLUTIONS = {
    "round": 480,
}


def make_second_pointer(w, h):
    """Small pill tip with gradient and 2px black outline on all edges, transparent below."""
    pad = 2
    iw = w + pad * 2
    img = Image.new("RGBA", (iw, h), (0, 0, 0, 0))

    tip_h = int(round(45 * h / SECOND_H))
    radius = w // 2

    # Black outline (2px on all sides)
    outline = Image.new("RGBA", (iw, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(outline)
    od.rounded_rectangle([0, 0, iw - 1, tip_h + pad], radius=radius + pad, fill=(0, 0, 0, 255))
    img = Image.alpha_composite(img, outline)

    # Gradient fill clipped to pill shape (offset by pad)
    for y in range(tip_h):
        t = y / max(tip_h - 1, 1)
        g = int(220 - t * 80)
        b = int(255 - t * 75)
        color = (0, g, b, 255)
        for x in range(w):
            inside = False
            if radius <= y <= tip_h - radius - 1:
                inside = True
            elif y < radius:
                inside = math.sqrt((x - radius) ** 2 + (y - radius) ** 2) <= radius
            else:
                inside = math.sqrt((x - radius) ** 2 + (y - (tip_h - radius - 1)) ** 2) <= radius
            if inside:
                img.putpixel((x + pad, y + pad), color)

    return img


def make_minute_pointer(pivot_y, tail, blob_d, line_w, circle_r, hole_r,
                        colors=((200, 80, 255), (90, 20, 180), (110, 30, 200))):
    """Gradient pointer with rounded ends, crosses center by tail pixels.

    Image coords: y=0 = screen edge (tip), y=pivot_y = rotation center,
    y=pivot_y+tail = tail end (crosses center).
    colors: (TOP, BOT, TAIL) RGB tuples.
    """
    up = 4
    total_h = pivot_y + tail
    img_w = max(line_w + 8, circle_r * 2 + 8)  # wide enough for line or circle
    bw = img_w * up
    bh = total_h * up
    cx = bw // 2

    blob_r = blob_d * up // 2
    lw = line_w * up // 2
    ol = 2 * up           # 2px outline in supersampled space

    TOP, BOT, TAIL = colors

    big = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    draw = ImageDraw.Draw(big)

    line_start = 0
    line_end   = bh

    radius = lw + ol  # rounded cap radius matches half-width

    # --- Black outline ---
    draw.rounded_rectangle([cx - lw - ol, line_start, cx + lw + ol, line_end],
                           radius=radius, fill=(0, 0, 0, 255))

    # --- Gradient fill: line ---
    pivot_big = pivot_y * up
    fill_layer = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fill_layer)
    for y in range(line_start, line_end):
        if y <= pivot_big:
            t = y / max(1, pivot_big)
            r = int(TOP[0] + (BOT[0] - TOP[0]) * t)
            g = int(TOP[1] + (BOT[1] - TOP[1]) * t)
            b = int(TOP[2] + (BOT[2] - TOP[2]) * t)
        else:
            r, g, b = TAIL
        fd.line([cx - lw, y, cx + lw, y], fill=(r, g, b, 255))
    # Clip fill to rounded shape
    mask = Image.new("L", (bw, bh), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([cx - lw, line_start, cx + lw, line_end],
                         radius=lw, fill=255)
    big.paste(fill_layer, mask=mask)

    # --- Center circle with hole ---
    cr = circle_r * up
    hr = hole_r * up
    py = pivot_y * up
    draw.ellipse([cx - cr - ol, py - cr - ol, cx + cr + ol, py + cr + ol],
                 fill=(0, 0, 0, 255))
    draw.ellipse([cx - cr, py - cr, cx + cr, py + cr],
                 fill=BOT)
    # Hole: black ring outline then transparent
    draw.ellipse([cx - hr - ol, py - hr - ol, cx + hr + ol, py + hr + ol],
                 fill=(0, 0, 0, 255))
    draw.ellipse([cx - hr, py - hr, cx + hr, py + hr],
                 fill=(0, 0, 0, 0))

    return big.resize((img_w, total_h), Image.LANCZOS)


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sw = max(4, int(round(SECOND_W * scale)) | 1)
    sh = max(20, int(round(SECOND_H * scale)))
    m_pivot = max(20, int(round(MINUTE_PIVOT_Y * scale)))
    m_tail  = max(2,  int(round(MINUTE_TAIL    * scale)))
    blob_d  = max(6,  int(round(MINUTE_BLOB_D  * scale)))
    line_w  = max(1,  int(round(MINUTE_LINE_W  * scale)))

    second_img = make_second_pointer(sw, sh)
    m_circle_r = max(4, int(round(MINUTE_CIRCLE_R * scale)))
    m_hole_r   = max(1, int(round(MINUTE_HOLE_R   * scale)))
    minute_img = make_minute_pointer(m_pivot, m_tail, blob_d, line_w, m_circle_r, m_hole_r)

    h_pivot = max(10, int(round(HOUR_PIVOT_Y * scale)))
    h_tail  = max(2,  int(round(HOUR_TAIL    * scale)))
    h_line_w= max(2,  int(round(HOUR_LINE_W  * scale)))
    hour_img = make_minute_pointer(h_pivot, h_tail, 0, h_line_w, m_circle_r, m_hole_r,
                                   colors=HOUR_COLOR)

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "pointer")
    os.makedirs(out_dir, exist_ok=True)
    second_img.save(os.path.join(out_dir, "seconds.png"))
    minute_img.save(os.path.join(out_dir, "minute.png"))
    hour_img.save(os.path.join(out_dir, "hour.png"))

    print(res_name + ": seconds=" + str(second_img.size) + " minute=" + str(minute_img.size) + " hour=" + str(hour_img.size))

print("Done!")
