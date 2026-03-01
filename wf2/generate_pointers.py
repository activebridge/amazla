#!/usr/bin/env python3
"""Generate neomorphic seconds pointer PNG for all resolutions."""

from PIL import Image, ImageDraw, ImageFilter
import math
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

REF_SIZE = 480
SECOND_W, SECOND_H = 17, 242

RESOLUTIONS = {
    "480x480": 480,
    "466x466": 466,
    "454x454": 454,
    "416x416": 416,
    "390x450": 390,
    "360x360": 360,
    "320x380": 320,
}


def make_second_pointer(w, h):
    """Neomorphic pill on black bg: light shadow top-left, dark body."""
    pad = 6
    iw, ih = w + pad * 2, h + pad * 2
    img = Image.new("RGBA", (iw, ih), (0, 0, 0, 0))

    pill_h = int(round(45 * h / SECOND_H))
    pill_w = w
    radius = pill_w // 2
    ox = pad

    # Light shadow (top-left) - neomorphic highlight
    light = Image.new("RGBA", (iw, ih), (0, 0, 0, 0))
    ld = ImageDraw.Draw(light)
    ld.rounded_rectangle(
        [ox - 2, pad - 2, ox + pill_w - 1 - 2, pad + pill_h - 1 - 2],
        radius=radius, fill=(255, 255, 255, 40)
    )
    light = light.filter(ImageFilter.GaussianBlur(3))
    img = Image.alpha_composite(img, light)

    # Dark shadow (bottom-right)
    dark = Image.new("RGBA", (iw, ih), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dark)
    dd.rounded_rectangle(
        [ox + 2, pad + 2, ox + pill_w - 1 + 2, pad + pill_h - 1 + 2],
        radius=radius, fill=(0, 0, 0, 80)
    )
    dark = dark.filter(ImageFilter.GaussianBlur(3))
    img = Image.alpha_composite(img, dark)

    # Black outline
    outline = Image.new("RGBA", (iw, ih), (0, 0, 0, 0))
    od = ImageDraw.Draw(outline)
    od.rounded_rectangle(
        [ox - 2, pad - 2, ox + pill_w + 1, pad + pill_h + 1],
        radius=radius + 2, fill=(0, 0, 0, 255)
    )
    img = Image.alpha_composite(img, outline)

    # Main pill body
    body = Image.new("RGBA", (iw, ih), (0, 0, 0, 0))
    for y in range(pill_h):
        t = y / max(pill_h - 1, 1)
        # Modern teal/cyan gradient
        r = int(0 + t * (0 - 0))
        g = int(200 + t * (140 - 200))
        b = int(220 + t * (180 - 220))

        for x in range(pill_w):
            inside = False
            if radius <= y <= pill_h - radius - 1:
                inside = True
            elif y < radius:
                dist = math.sqrt((x - radius) ** 2 + (y - radius) ** 2)
                inside = dist <= radius
            else:
                cy_c = pill_h - radius - 1
                dist = math.sqrt((x - radius) ** 2 + (y - cy_c) ** 2)
                inside = dist <= radius

            if inside:
                alpha = 255
                if y < radius:
                    dist = math.sqrt((x - radius) ** 2 + (y - radius) ** 2)
                    if dist > radius - 1:
                        alpha = max(0, int(255 * (radius - dist)))
                elif y > pill_h - radius - 1:
                    cy_c = pill_h - radius - 1
                    dist = math.sqrt((x - radius) ** 2 + (y - cy_c) ** 2)
                    if dist > radius - 1:
                        alpha = max(0, int(255 * (radius - dist)))
                body.putpixel((ox + x, pad + y), (r, g, b, alpha))

    img = Image.alpha_composite(img, body)

    # Inner highlight at top edge
    hl = Image.new("RGBA", (iw, ih), (0, 0, 0, 0))
    hld = ImageDraw.Draw(hl)
    hld.rounded_rectangle(
        [ox + 2, pad + 1, ox + pill_w - 3, pad + pill_h // 4],
        radius=max(1, radius - 2), fill=(255, 255, 255, 20)
    )
    img = Image.alpha_composite(img, hl)

    return img


for res_name, res_width in RESOLUTIONS.items():
    scale = res_width / REF_SIZE
    sw = max(9, int(round(SECOND_W * scale)) | 1)
    sh = max(50, int(round(SECOND_H * scale)))

    second_img = make_second_pointer(sw, sh)

    out_dir = os.path.join(BASE_DIR, "assets", res_name, "pointer")
    os.makedirs(out_dir, exist_ok=True)
    second_img.save(os.path.join(out_dir, "hour.png"))

    print(res_name + ": " + str(second_img.size))

print("Done!")
