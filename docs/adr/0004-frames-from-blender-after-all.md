# Rendered frames from Blender, after all

Supersedes [ADR 1](0001-live-3d-not-frames.md).

The live three.js version worked, and it was the wrong trade for this page. Two things changed my mind once I watched it on ordinary hardware:

- **It did not look like Aman.** Rounded boxes, a painted view and screen-space occlusion read as a game, however carefully lit. The reference film reads as a photograph. For a brand that sells itself on light and materials, that difference is the whole point.
- **It stuttered.** Shadow maps, an AO pass and a dozen lights every frame are too much for a laptop on battery, and a hotel's audience browses on exactly that.

## What replaced it

The same plan files are exported to JSON (`scripts/suites-json.ts`) and built in Blender by script (`blender/`): walls with shadow gaps, real glazing with mullions, bevelled and subdivided upholstery, Brick-texture floorboards and stone, a physical sky, portals on every window so Cycles samples daylight properly, and the actual city, desert or sea outside, not a painted cylinder. Cycles renders each walk as an image sequence on the GPU. A second pass renders the maquette frames with a white material override.

In the browser the page draws one image per frame on a canvas. Scroll is mapped to a frame number by the same GSAP timeline as before ([ADR 3](0003-scroll-writes-numbers.md)); frames are fetched as WebP, kept compressed, and only the dozen around the playhead are decoded, off the main thread, with `createImageBitmap`. Drawing a decoded bitmap costs almost nothing, so scrolling is smooth on anything that can play a video.

## What it costs

- **Weight.** The walk is close to five hundred frames. They load progressively (every sixteenth frame first, then the gaps), so it is usable within a second or two, but the full set is tens of megabytes. Phones get a smaller set.
- **Rendering time.** About an hour and a quarter at 1920×1080 on a laptop RTX 5070 Ti.
- **One room, not three.** Rendering this way made me cut the three invented suites down to one real one, the Deluxe Suite at Aman Tokyo, modelled from its photographs. That was the right cut anyway. Changing a sofa means re-rendering the frames that see it. The renderer skips frames already on disk, so a partial re-render is a matter of deleting the right files.
- **No pointer parallax.** The camera only moves where it was filmed.

## What stays

The plan files, the walk test and the timeline. The test matters more now: a camera that goes through a wall costs an hour of rendering, not a refresh.
