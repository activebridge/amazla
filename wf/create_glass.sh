#!/bin/bash
cd /Users/galulex/amazla/wf/assets/480x480-amazfit-balance

# Create circular frosted glass effect with shadow
magick -size 480x480 xc:none \
  \( -size 440x440 xc:none -fill 'rgba(255,255,255,0.08)' -draw 'circle 220,220 220,5' \
     -blur 0x2 \) -gravity center -composite \
  \( -size 440x440 xc:none -fill none -stroke 'rgba(255,255,255,0.3)' -strokewidth 2 \
     -draw 'circle 220,220 220,5' \) -gravity center -composite \
  \( -size 480x480 xc:none -fill 'rgba(0,0,0,0.15)' -draw 'circle 245,250 245,25' \
     -blur 0x15 \) -compose DstOver -composite \
  PNG32:glass_overlay.png

# Optimize with TinyPNG
API_KEY="zxRK_-oeGEOFgTRyJT0nM80E271KBJ_P"
RESPONSE=$(curl -s --user "api:$API_KEY" --data-binary @glass_overlay.png https://api.tinify.com/shrink)
URL=$(echo "$RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
if [ -n "$URL" ]; then
  curl -s --user "api:$API_KEY" "$URL" -o glass_overlay.png
  echo "Optimized!"
fi

ls -lh glass_overlay.png
file glass_overlay.png
