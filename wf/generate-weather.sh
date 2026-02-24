#!/bin/bash

# Generate weather background images (gradients only, no icons)

ASSETS_DIR="/Users/galulex/amazla/wf/assets"

# Weather gradients (index: "top_color-bottom_color")
GRADIENTS=(
  "#8AAED0-#5A7A9A"   # 0 cloudy
  "#5A7A9A-#3A5A7A"   # 1 showers
  "#D0E0F0-#A0B8D0"   # 2 snow_showers
  "#F0B040-#E08020"   # 3 sunny
  "#708090-#4A5A6A"   # 4 overcast
  "#7090B0-#4A6A8A"   # 5 light_rain
  "#E0E8F0-#B0C0D0"   # 6 light_snow
  "#4A6A8A-#2A4A6A"   # 7 moderate_rain
  "#C0D0E0-#90A0B0"   # 8 moderate_snow
  "#A0B0C0-#708090"   # 9 heavy_snow
  "#3A5A7A-#1A3A5A"   # 10 heavy_rain
  "#D0A070-#A07040"   # 11 sandstorm
  "#7090B0-#506080"   # 12 rain_snow
  "#B0B8C0-#808890"   # 13 fog
  "#A0A090-#707060"   # 14 hazy
  "#4A5A80-#2A3A60"   # 15 tstorms
  "#90A0B8-#607080"   # 16 snowstorm
  "#D8C090-#A89060"   # 17 floating_dust
  "#2A4A70-#0A2A50"   # 18 very_heavy_rainstorm
  "#5A7090-#3A5070"   # 19 rain_hail
  "#3A4A70-#1A2A50"   # 20 tstorms_hail
  "#304060-#102040"   # 21 heavy_rainstorm
  "#C0A080-#907050"   # 22 dust
  "#906040-#603020"   # 23 heavy_sandstorm
  "#405080-#203060"   # 24 rainstorm
  "#808080-#505050"   # 25 unknown
  "#3A4A60-#1A2A40"   # 26 cloudy_night
  "#2A3A50-#0A1A30"   # 27 showers_night
  "#2A3550-#0A1530"   # 28 sunny_night
)

for dir in "$ASSETS_DIR"/*; do
  if [ -d "$dir" ]; then
    folder_name=$(basename "$dir")
    dimensions=$(echo "$folder_name" | grep -oE '^[0-9]+x[0-9]+')

    if [ -n "$dimensions" ]; then
      w=$(echo "$dimensions" | cut -d'x' -f1)
      h=$(echo "$dimensions" | cut -d'x' -f2)

      weather_dir="$dir/weather"
      mkdir -p "$weather_dir"

      echo "Generating weather backgrounds for $folder_name ($w x $h)..."

      for i in {0..28}; do
        gradient="${GRADIENTS[$i]}"
        top_color=$(echo "$gradient" | cut -d'-' -f1)
        bottom_color=$(echo "$gradient" | cut -d'-' -f2)

        # Create gradient background only
        magick -size "${w}x${h}" "gradient:${top_color}-${bottom_color}" \
          -depth 8 \
          -type TrueColorAlpha \
          -define png:color-type=6 \
          -define png:bit-depth=8 \
          "$weather_dir/${i}.png"
      done

      echo "  Created 29 weather backgrounds"
    fi
  fi
done

echo "Done!"
