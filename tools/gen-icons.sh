#!/usr/bin/env bash
# Generate PWA icons from an inline SVG. Dev-time only.
# Requires one of: rsvg-convert | ImageMagick (magick/convert) | inkscape.
set -e
cd "$(dirname "$0")/.."
mkdir -p icons

cat > icons/icon.svg <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#13111c"/>
  <rect x="56" y="56" width="400" height="400" rx="72" fill="#6d28d9"/>
  <path d="M180 150 h70 a26 26 0 1 1 52 0 h70 v70 a26 26 0 1 1 0 52 v70 h-70 a26 26 0 1 0 -52 0 h-70 v-70 a26 26 0 1 1 0 -52 z"
        fill="#a78bfa"/>
</svg>
SVG

render() { # size outfile
  local s="$1" out="$2"
  if   command -v rsvg-convert >/dev/null 2>&1; then rsvg-convert -w "$s" -h "$s" icons/icon.svg -o "$out"
  elif command -v magick       >/dev/null 2>&1; then magick -background none -density 384 icons/icon.svg -resize "${s}x${s}" "$out"
  elif command -v convert      >/dev/null 2>&1; then convert -background none -density 384 icons/icon.svg -resize "${s}x${s}" "$out"
  elif command -v inkscape     >/dev/null 2>&1; then inkscape -w "$s" -h "$s" icons/icon.svg -o "$out"
  else echo "No SVG rasterizer found (need rsvg-convert / ImageMagick / inkscape)" >&2; exit 1
  fi
}

render 192 icons/icon-192.png
render 512 icons/icon-512.png
cp icons/icon-512.png icons/icon-512-maskable.png
echo "Icons written to icons/"
