#!/usr/bin/env python3
"""Generate a bold hourglass icon using basic shapes."""

from PIL import Image, ImageDraw

up = 480
s = up / 96.0

img = Image.new("RGBA", (up, up), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Center of the 96x96 canvas scaled to 'up'
cx = up // 2
cy = up // 2

# Outer Frame (Hourglass shape)
# Top part (triangle)
top_pts = [
    (cx - int(35*s), int(10*s)), # L top
    (cx + int(35*s), int(10*s)), # R top
    (cx, cy)                     # Center
]
draw.polygon(top_pts, fill=(0, 0, 0, 255))

# Bottom part (triangle)
bot_pts = [
    (cx, cy),                    # Center
    (cx + int(35*s), int(86*s)), # R bot
    (cx - int(35*s), int(86*s))  # L bot
]
draw.polygon(bot_pts, fill=(0, 0, 0, 255))

# Top and Bottom bars
draw.rounded_rectangle([cx - int(38*s), int(10*s), cx + int(38*s), int(18*s)], radius=int(4*s), fill=(0, 0, 0, 255))
draw.rounded_rectangle([cx - int(38*s), int(78*s), cx + int(38*s), int(86*s)], radius=int(4*s), fill=(0, 0, 0, 255))

result = img.resize((96, 96), Image.LANCZOS)
result.save("/tmp/standing_icon.png")
print("Done")
