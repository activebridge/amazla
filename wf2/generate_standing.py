#!/usr/bin/env python3
"""Generate a much thicker and bolder human silhouette for the standing icon."""

from PIL import Image, ImageDraw

up = 480
s = up / 96.0

img = Image.new("RGBA", (up, up), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Center of the 96x96 canvas scaled to 'up'
cx = up // 2

# Bold Head
draw.ellipse([cx - int(12*s), int(6*s), cx + int(12*s), int(30*s)], fill=(0, 0, 0, 255))

# Thick Neck
draw.rectangle([cx - int(5*s), int(28*s), cx + int(5*s), int(34*s)], fill=(0, 0, 0, 255))

# Very Bold Shoulders & Torso
torso_pts = [
    (cx - int(24*s), int(34*s)), # L shoulder
    (cx + int(24*s), int(34*s)), # R shoulder
    (cx + int(18*s), int(60*s)), # R waist
    (cx - int(18*s), int(60*s)), # L waist
]
draw.polygon(torso_pts, fill=(0, 0, 0, 255))

# Thick Hips
hip_pts = [
    (cx - int(18*s), int(60*s)),
    (cx + int(18*s), int(60*s)),
    (cx + int(20*s), int(70*s)),
    (cx - int(20*s), int(70*s)),
]
draw.polygon(hip_pts, fill=(0, 0, 0, 255))

# Bold Arms (integrated into shoulder profile)
# L Arm
draw.rounded_rectangle([cx - int(32*s), int(34*s), cx - int(22*s), int(65*s)], radius=int(5*s), fill=(0, 0, 0, 255))
# R Arm
draw.rounded_rectangle([cx + int(22*s), int(34*s), cx + int(32*s), int(65*s)], radius=int(5*s), fill=(0, 0, 0, 255))

# Heavy Tapered Legs
# L Leg
l_leg_pts = [
    (cx - int(20*s), int(70*s)),
    (cx - int(4*s), int(70*s)),
    (cx - int(10*s), int(94*s)),
    (cx - int(26*s), int(94*s)),
]
draw.polygon(l_leg_pts, fill=(0, 0, 0, 255))
# R Leg
r_leg_pts = [
    (cx + int(4*s), int(70*s)),
    (cx + int(20*s), int(70*s)),
    (cx + int(26*s), int(94*s)),
    (cx + int(10*s), int(94*s)),
]
draw.polygon(r_leg_pts, fill=(0, 0, 0, 255))

result = img.resize((96, 96), Image.LANCZOS)
result.save("/tmp/standing_icon.png")
print("Done")
