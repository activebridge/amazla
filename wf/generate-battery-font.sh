#!/bin/bash

# Generate small font for battery charge display - black with white outline

ASSETS_DIR="/Users/galulex/amazla/wf/assets"
FONT_SIZE=28
FONT_COLOR="black"
FONT_NAME="Avenir-Black"
OUTLINE_COLOR="white"
OUTLINE_WIDTH=2

generate_char() {
  local char="$1"
  local output="$2"

  magick -background none \
    -fill none \
    -stroke "$OUTLINE_COLOR" \
    -strokewidth $OUTLINE_WIDTH \
    -font "$FONT_NAME" \
    -pointsize $FONT_SIZE \
    -gravity center \
    label:"$char" \
    \( -background none \
       -fill "$FONT_COLOR" \
       -stroke none \
       -font "$FONT_NAME" \
       -pointsize $FONT_SIZE \
       -gravity center \
       label:"$char" \) \
    -gravity center \
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
      fonts_dir="$dir/battery/font"
      mkdir -p "$fonts_dir"

      echo "Generating battery font for $folder_name..."

      for i in {0..9}; do
        generate_char "$i" "$fonts_dir/${i}.png"
      done

      generate_char "%" "$fonts_dir/percent.png"

      echo "  Created battery font (0-9, percent)"
    fi
  fi
done

echo "Done!"
