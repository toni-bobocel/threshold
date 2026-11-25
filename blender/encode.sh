#!/bin/sh
# Turns the PNG renders into the WebP frames the site loads: d/ for desktop,
# m/ for phones. Colour frames are c0000.webp, maquette frames k0000.webp.
FFMPEG=${FFMPEG:-ffmpeg}
cd "$(dirname "$0")/.."
for suite in "$@"; do
  src=blender/out/$suite
  dst=public/frames/$suite
  mkdir -p "$dst/d" "$dst/m"
  cp "$src/colour/meta.json" "$dst/meta.json"
  for pass in colour clay; do
    prefix=c
    [ "$pass" = clay ] && prefix=k
    for png in "$src/$pass"/*.png; do
      [ -e "$png" ] || continue
      n=$(basename "$png" .png)
      "$FFMPEG" -loglevel error -y -i "$png" -c:v libwebp -quality 80 -pix_fmt yuva420p "$dst/d/$prefix$n.webp"
      "$FFMPEG" -loglevel error -y -i "$png" -vf scale=800:-1 -c:v libwebp -quality 74 -pix_fmt yuva420p "$dst/m/$prefix$n.webp"
    done
  done
done
