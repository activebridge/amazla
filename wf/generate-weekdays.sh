#!/bin/bash

# Generate weekday images for watchface
# Creates 0-6 (Sun-Sat)

ASSETS_DIR="/Users/galulex/amazla/wf/assets"
FONT_SIZE=28
FONT_COLOR="white"

WEEKDAYS=("SUN" "MON" "TUE" "WED" "THU" "FRI" "SAT")

# Get all asset directories
for dir in "$ASSETS_DIR"/*; do
  if [ -d "$dir" ]; then
    folder_name=$(basename "$dir")
    dimensions=$(echo "$folder_name" | grep -oE '^[0-9]+x[0-9]+')

    if [ -n "$dimensions" ]; then
      weekdays_dir="$dir/weekdays"
      mkdir -p "$weekdays_dir"

      echo "Generating weekday images for $folder_name..."

      for i in {0..6}; do
        magick -background none \
          -fill "$FONT_COLOR" \
          -font Helvetica-Bold \
          -pointsize $FONT_SIZE \
          -gravity center \
          label:"${WEEKDAYS[$i]}" \
          -type TrueColorAlpha \
          -define png:color-type=6 \
          "$weekdays_dir/${i}.png"
      done

      echo "  Created weekday images (0-6: Sun-Sat)"
    fi
  fi
done

echo "Done!"
