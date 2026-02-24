#!/bin/bash

# Generate digit font images with neomorphic shadow
# Creates 0-9, minus sign, degree symbol, separator, percent

ASSETS_DIR="/Users/galulex/amazla/wf/assets"
FONT_SIZE=36
FONT_COLOR="white"
FONT_NAME="Avenir-Medium"
SHADOW_COLOR="#00000080"
SHADOW_OFFSET=2

generate_char() {
  local char="$1"
  local output="$2"

  # Create text with shadow for visibility on any background
  magick -background none \
    -fill "$SHADOW_COLOR" \
    -font "$FONT_NAME" \
    -pointsize $FONT_SIZE \
    -gravity center \
    label:"$char" \
    -blur 0x1 \
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
      fonts_dir="$dir/fonts"
      mkdir -p "$fonts_dir"

      echo "Generating font images for $folder_name..."

      # Generate digits 0-9
      for i in {0..9}; do
        generate_char "$i" "$fonts_dir/${i}.png"
      done

      # Generate special characters
      generate_char "-" "$fonts_dir/minus.png"
      generate_char "°" "$fonts_dir/degree.png"
      generate_char "/" "$fonts_dir/separator.png"
      generate_char "%" "$fonts_dir/percent.png"

      echo "  Created font images with shadow (0-9, minus, degree, separator, percent)"
    fi
  fi
done

echo "Done!"
