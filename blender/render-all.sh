#!/bin/sh
# Every suite, colour then clay. Frames already on disk are skipped, so this resumes.
BLENDER=${BLENDER:-"/c/Program Files/Blender Foundation/Blender 5.1/blender.exe"}
cd "$(dirname "$0")/.."
for suite in tokyo amangiri amanpuri; do
  for pass in colour clay; do
    "$BLENDER" -b --factory-startup --python blender/render.py -- "$suite" "$pass" | grep --line-buffered '^frame'
  done
done
