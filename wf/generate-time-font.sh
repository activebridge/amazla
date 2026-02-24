#!/bin/bash

# Generate large time font with neomorphic shadow

ASSETS_DIR="/Users/galulex/amazla/wf/assets"
FONT_SIZE=140
FONT_COLOR="white"
FONT_NAME="Avenir-Light"
SHADOW_COLOR="#00000060"
SHADOW_OFFSET=3

generate_char() {
  local char="$1"
  local output="$2"

  magick -background none \
    -fill "$SHADOW_COLOR" \
    -font "$FONT_NAME" \
    -pointsize $FONT_SIZE \
    -gravity center \
    label:"$char" \
    -blur 0x2 \
    \( -background none \
       -fill "$FONT_COLOR" \
       -font "$FONT_NAME" \
       -pointsize $FONT_SIZE \
       -gravity center \
       label:"$char" \) \
    -gravity center -geometry -${SHADOW_OFFSET}-${SHADOW_OFFSET} \
    -composite \
    -depth 8 \
    -type TrueColorAlpha \
    -define png:color-type=6 \
    -define png:bit-depth=8 \
    "$output"
}

for dir in "$ASSETS_DIR"/*; do
  if [ -d "$dir" ]; then
    folder_name=$(basename "$dir")
    dimensions=$(echo "$folder_name" | grep -oE '^[0-9]+x[0-9]+')

    if [ -n "$dimensions" ]; then
      time_dir="$dir/time"
      mkdir -p "$time_dir"

      echo "Generating time font for $folder_name..."

      for i in {0..9}; do
        generate_char "$i" "$time_dir/${i}.png"
      done

      # Generate colon using same method as digits
      generate_char ":" "$time_dir/colon.png"

      echo "  Created time font (0-9, colon)"
    fi
  fi
done

echo "Done!"
