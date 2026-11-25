#!/bin/sh
# Colour then clay. Frames already on disk are skipped, so this resumes.
BLENDER=${BLENDER:-"/c/Program Files/Blender Foundation/Blender 5.1/blender.exe"}
cd "$(dirname "$0")/.."
for pass in colour clay; do
  "$BLENDER" -b --factory-startup --python blender/render.py -- tokyo "$pass" | grep --line-buffered '^frame'
done
