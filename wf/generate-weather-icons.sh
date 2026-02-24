#!/bin/bash

# Generate weather icon images (transparent background with white icons)

ASSETS_DIR="/Users/galulex/amazla/wf/assets"
ICON_SIZE=120  # Icon image size

for dir in "$ASSETS_DIR"/*; do
  if [ -d "$dir" ]; then
    folder_name=$(basename "$dir")
    dimensions=$(echo "$folder_name" | grep -oE '^[0-9]+x[0-9]+')

    if [ -n "$dimensions" ]; then
      icons_dir="$dir/weather-icons"
      mkdir -p "$icons_dir"

      # Calculate center
      cx=$((ICON_SIZE / 2))
      cy=$((ICON_SIZE / 2))

      echo "Generating weather icons for $folder_name..."

      for i in {0..28}; do
        # Icon drawing based on weather type
        case $i in
          3) # sunny - sun with rays
            draw="stroke white stroke-width 3 fill none
                  circle $cx,$cy $((cx+25)),$cy
                  line $((cx-45)),$cy $((cx-30)),$cy
                  line $((cx+30)),$cy $((cx+45)),$cy
                  line $cx,$((cy-45)) $cx,$((cy-30))
                  line $cx,$((cy+30)) $cx,$((cy+45))
                  line $((cx-32)),$((cy-32)) $((cx-22)),$((cy-22))
                  line $((cx+22)),$((cy-22)) $((cx+32)),$((cy-32))
                  line $((cx-32)),$((cy+32)) $((cx-22)),$((cy+22))
                  line $((cx+22)),$((cy+22)) $((cx+32)),$((cy+32))"
            ;;
          0|4|26) # cloudy
            draw="stroke white stroke-width 3 fill none
                  ellipse $((cx-12)),$((cy+5)) 22,16 0,360
                  ellipse $((cx+15)),$((cy+5)) 18,14 0,360
                  ellipse $cx,$((cy-12)) 18,14 0,360"
            ;;
          1|5|7|10|24|18|21|27) # rain
            draw="stroke white stroke-width 3 fill none
                  ellipse $((cx-12)),$((cy-12)) 22,16 0,360
                  ellipse $((cx+15)),$((cy-12)) 18,14 0,360
                  ellipse $cx,$((cy-28)) 18,14 0,360
                  line $((cx-18)),$((cy+10)) $((cx-24)),$((cy+30))
                  line $cx,$((cy+10)) $((cx-6)),$((cy+30))
                  line $((cx+18)),$((cy+10)) $((cx+12)),$((cy+30))"
            ;;
          2|6|8|9|16) # snow
            draw="stroke white stroke-width 3 fill none
                  ellipse $((cx-12)),$((cy-12)) 22,16 0,360
                  ellipse $((cx+15)),$((cy-12)) 18,14 0,360
                  ellipse $cx,$((cy-28)) 18,14 0,360
                  stroke white stroke-width 2 fill white
                  circle $((cx-15)),$((cy+22)) $((cx-13)),$((cy+22))
                  circle $cx,$((cy+25)) $((cx+2)),$((cy+25))
                  circle $((cx+15)),$((cy+22)) $((cx+17)),$((cy+22))"
            ;;
          15|20) # thunderstorm
            draw="stroke white stroke-width 3 fill none
                  ellipse $((cx-12)),$((cy-18)) 22,16 0,360
                  ellipse $((cx+15)),$((cy-18)) 18,14 0,360
                  ellipse $cx,$((cy-34)) 18,14 0,360
                  stroke #FFD700 stroke-width 4 fill none
                  polyline $((cx-3)),$((cy+2)) $((cx+6)),$((cy+15)) $((cx-3)),$((cy+15)) $((cx+10)),$((cy+35))"
            ;;
          13|14|17|22|11|23) # fog/dust
            draw="stroke white stroke-width 3 fill none stroke-linecap round
                  line $((cx-35)),$((cy-12)) $((cx+35)),$((cy-12))
                  line $((cx-30)),$cy $((cx+30)),$cy
                  line $((cx-35)),$((cy+12)) $((cx+35)),$((cy+12))"
            ;;
          28) # clear night - moon and stars
            draw="stroke white stroke-width 3 fill none
                  arc $((cx-25)),$((cy-25)) $((cx+25)),$((cy+25)) 200,340
                  arc $((cx-15)),$((cy-15)) $((cx+35)),$((cy+35)) 200,340
                  stroke white stroke-width 2 fill white
                  circle $((cx+35)),$((cy-30)) $((cx+36)),$((cy-30))
                  circle $((cx+45)),$((cy-10)) $((cx+46)),$((cy-10))
                  circle $((cx-40)),$((cy+20)) $((cx-39)),$((cy+20))"
            ;;
          12|19) # rain+snow/hail
            draw="stroke white stroke-width 3 fill none
                  ellipse $((cx-12)),$((cy-12)) 22,16 0,360
                  ellipse $((cx+15)),$((cy-12)) 18,14 0,360
                  line $((cx-18)),$((cy+10)) $((cx-24)),$((cy+28))
                  line $((cx+18)),$((cy+10)) $((cx+12)),$((cy+28))
                  stroke white stroke-width 2 fill white
                  circle $cx,$((cy+25)) $((cx+3)),$((cy+25))"
            ;;
          *) # default cloud
            draw="stroke white stroke-width 3 fill none
                  ellipse $((cx-12)),$cy 22,16 0,360
                  ellipse $((cx+15)),$cy 18,14 0,360
                  ellipse $cx,$((cy-16)) 18,14 0,360"
            ;;
        esac

        # Create transparent background with icon
        magick -size "${ICON_SIZE}x${ICON_SIZE}" xc:none \
          -draw "$draw" \
          -depth 8 \
          -type TrueColorAlpha \
          -define png:color-type=6 \
          -define png:bit-depth=8 \
          "$icons_dir/${i}.png"
      done

      echo "  Created 29 weather icons"
    fi
  fi
done

echo "Done!"
