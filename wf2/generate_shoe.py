#!/usr/bin/env python3
"""Generate running shoe icon using basic shapes."""

from PIL import Image, ImageDraw

up = 480
s = up / 96.0

img = Image.new("RGBA", (up, up), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Sole - rounded rectangle at bottom
draw.rounded_rectangle(
    [int(6*s), int(64*s), int(90*s), int(82*s)],
    radius=int(8*s), fill=(0, 0, 0, 255)
)

# Main body - large ellipse for shoe upper
draw.ellipse(
    [int(4*s), int(30*s), int(92*s), int(72*s)],
    fill=(0, 0, 0, 255)
)

# Toe bump - raise the front
draw.ellipse(
    [int(60*s), int(24*s), int(92*s), int(66*s)],
    fill=(0, 0, 0, 255)
)

# Heel raise
draw.ellipse(
    [int(4*s), int(26*s), int(36*s), int(68*s)],
    fill=(0, 0, 0, 255)
)

# Tongue - small bump sticking up from top
draw.ellipse(
    [int(34*s), int(14*s), int(56*s), int(42*s)],
    fill=(0, 0, 0, 255)
)

# Ankle opening - cut out the top-back area
draw.ellipse(
    [int(10*s), int(12*s), int(48*s), int(38*s)],
    fill=(0, 0, 0, 0)
)

# Cut top to create clean shoe profile
draw.rectangle(
    [0, 0, up, int(18*s)],
    fill=(0, 0, 0, 0)
)

result = img.resize((96, 96), Image.LANCZOS)
result.save("/tmp/steps_icon.png")
print("Done")
