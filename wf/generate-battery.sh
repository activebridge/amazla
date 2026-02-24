#!/bin/bash

# Generate battery outline + fill level images (7 fill levels)

ASSETS_DIR="/Users/galulex/amazla/wf/assets"

for dir in "$ASSETS_DIR"/*; do
  if [ -d "$dir" ]; then
    folder_name=$(basename "$dir")
    dimensions=$(echo "$folder_name" | grep -oE '^[0-9]+x[0-9]+')

    if [ -n "$dimensions" ]; then
      battery_dir="$dir/battery"
      mkdir -p "$battery_dir"

      echo "Generating battery icons for $folder_name..."

      # Static battery outline (always visible) - 100x40
      magick -size 100x40 xc:none \
        -fill "#00000040" -stroke none -draw "roundrectangle 12,4 80,35 5,5" \
        -fill "#ffffff20" -stroke none -draw "roundrectangle 8,0 76,31 5,5" \
        -fill none -stroke white -strokewidth 2 -draw "roundrectangle 12,4 80,33 5,5" \
        -fill white -stroke none -draw "roundrectangle 81,12 87,23 2,2" \
        -depth 8 -type TrueColorAlpha -define png:color-type=6 -define png:bit-depth=8 \
        "$battery_dir/icon.png"

      # Fill level images (just the colored bar, no outline) - 100x40
      for i in {0..6}; do
        fill_percent=$(((i + 1) * 100 / 7))

        # Choose color based on level
        # image 0 (8-21%): red
        # image 1 (22-35%): yellow
        # images 2-6 (36%+): white
        if [ $i -eq 0 ]; then
          fill_color="#FF3B30"
        elif [ $i -eq 1 ]; then
          fill_color="#FFCC00"
        else
          fill_color="white"
        fi

        # Calculate fill width (inner area: x=15 to x=78, width=63)
        fill_width=$((63 * fill_percent / 100))

        magick -size 100x40 xc:none \
          -fill "$fill_color" -stroke none -draw "roundrectangle 15,7 $((15 + fill_width)),30 3,3" \
          -depth 8 -type TrueColorAlpha -define png:color-type=6 -define png:bit-depth=8 \
          "$battery_dir/${i}.png"
      done

      echo "  Created battery outline + 7 fill levels"
    fi
  fi
done

echo "Done!"
