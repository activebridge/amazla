"""Shared gradient circle/hexagon drawing utilities."""

from PIL import Image, ImageDraw, ImageFilter
import math


def lighten(color, amount=0.3):
    return tuple(min(255, int(c + (255 - c) * amount)) for c in color)


def darken(color, amount=0.3):
    return tuple(max(0, int(c * (1 - amount))) for c in color)


def gradient_circle(sz, outline, color):
    """Draw a circle with vertical gradient: lighter top, darker bottom."""
    up = 4
    big = sz * up
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([0, 0, big - 1, big - 1], fill=(0, 0, 0, 255))

    color_top = lighten(color, 0.3)
    color_bot = darken(color, 0.3)
    inner_start = outline * up
    inner_end = big - 1 - outline * up

    grad = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(grad)
    for y in range(inner_start, inner_end + 1):
        t = (y - inner_start) / max(1, inner_end - inner_start)
        r = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        g = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        b = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        grad_draw.line([(inner_start, y), (inner_end, y)], fill=(r, g, b, 255))

    mask = Image.new("L", (big, big), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse([inner_start, inner_start, inner_end, inner_end], fill=255)
    img.paste(grad, mask=mask)

    return img.resize((sz, sz), Image.LANCZOS)


def gradient_hexagon(sz, outline, color):
    """Draw a rounded hexagon with vertical gradient inside black circle."""
    up = 4
    big = sz * up
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([0, 0, big - 1, big - 1], fill=(0, 0, 0, 255))

    color_top = lighten(color, 0.3)
    color_bot = darken(color, 0.3)

    cx, cy = big // 2, big // 2
    inner = big - outline * up * 2
    r = int(inner * 0.42)

    hex_img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    hex_draw = ImageDraw.Draw(hex_img)
    pts = []
    for i in range(6):
        angle = math.radians(60 * i)
        pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    hex_draw.polygon(pts, fill=(255, 255, 255, 255))
    alpha = hex_img.split()[3]
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=up * 1.5))
    hex_mask = alpha.point(lambda x: 255 if x > 80 else 0)

    grad = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(grad)
    for y in range(big):
        t = y / max(1, big - 1)
        rv = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        gv = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        bv = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        grad_draw.line([(0, y), (big - 1, y)], fill=(rv, gv, bv, 255))

    img.paste(grad, mask=hex_mask)
    return img.resize((sz, sz), Image.LANCZOS)


def gradient_rounded_triangle(sz, outline, color):
    """Draw a rounded triangle with vertical gradient inside black circle."""
    up = 4
    big = sz * up
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([0, 0, big - 1, big - 1], fill=(0, 0, 0, 255))

    color_top = lighten(color, 0.3)
    color_bot = darken(color, 0.3)

    cx, cy = big // 2, big // 2
    inner = big - outline * up * 2
    r = int(inner * 0.42)

    # Triangle pointing up
    tri_img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    tri_draw = ImageDraw.Draw(tri_img)
    pts = []
    for i in range(3):
        angle = math.radians(120 * i - 90 + 65)
        pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    tri_draw.polygon(pts, fill=(255, 255, 255, 255))
    alpha = tri_img.split()[3]
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=up * 3))
    tri_mask = alpha.point(lambda x: 255 if x > 60 else 0)

    grad = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(grad)
    for y in range(big):
        t = y / max(1, big - 1)
        rv = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        gv = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        bv = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        grad_draw.line([(0, y), (big - 1, y)], fill=(rv, gv, bv, 255))

    img.paste(grad, mask=tri_mask)
    return img.resize((sz, sz), Image.LANCZOS)


def gradient_rhombus(sz, outline, color):
    """Draw a rounded rhombus (diamond) with vertical gradient inside black circle."""
    up = 4
    big = sz * up
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([0, 0, big - 1, big - 1], fill=(0, 0, 0, 255))

    color_top = lighten(color, 0.3)
    color_bot = darken(color, 0.3)

    cx, cy = big // 2, big // 2
    inner = big - outline * up * 2
    r = int(inner * 0.45)

    rhomb_img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    rhomb_draw = ImageDraw.Draw(rhomb_img)
    pts = [
        (cx, cy - r),      # top
        (cx + r, cy),      # right
        (cx, cy + r),      # bottom
        (cx - r, cy),      # left
    ]
    rhomb_draw.polygon(pts, fill=(255, 255, 255, 255))
    alpha = rhomb_img.split()[3]
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=up * 2))
    rhomb_mask = alpha.point(lambda x: 255 if x > 80 else 0)

    grad = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(grad)
    for y in range(big):
        t = y / max(1, big - 1)
        rv = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        gv = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        bv = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        grad_draw.line([(0, y), (big - 1, y)], fill=(rv, gv, bv, 255))

    img.paste(grad, mask=rhomb_mask)
    return img.resize((sz, sz), Image.LANCZOS)


def gradient_pentagon(sz, outline, color):
    """Draw a rounded pentagon with vertical gradient inside black circle."""
    up = 4
    big = sz * up
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([0, 0, big - 1, big - 1], fill=(0, 0, 0, 255))

    color_top = lighten(color, 0.3)
    color_bot = darken(color, 0.3)

    cx, cy = big // 2, big // 2
    inner = big - outline * up * 2
    r = int(inner * 0.43)

    pent_img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    pent_draw = ImageDraw.Draw(pent_img)
    pts = []
    for i in range(5):
        angle = math.radians(72 * i - 90)
        pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    pent_draw.polygon(pts, fill=(255, 255, 255, 255))
    alpha = pent_img.split()[3]
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=up * 1.8))
    pent_mask = alpha.point(lambda x: 255 if x > 80 else 0)

    grad = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(grad)
    for y in range(big):
        t = y / max(1, big - 1)
        rv = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        gv = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        bv = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        grad_draw.line([(0, y), (big - 1, y)], fill=(rv, gv, bv, 255))

    img.paste(grad, mask=pent_mask)
    return img.resize((sz, sz), Image.LANCZOS)
