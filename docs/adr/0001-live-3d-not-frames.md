# Live 3D, not a frame sequence

The site I took the idea from plays a pre-rendered film, frame by frame, as you scroll. That is the usual way to do it and it looks wonderful. I chose to render the suites live in three.js instead.

## Why

- **Weight.** A smooth scroll film needs a frame for every few pixels of scroll. At 1440 px wide that is tens of megabytes per suite, before retina. Here the walk-through is about 300 kB of compressed JavaScript for all three suites, with no images of its own, and it is only fetched when you scroll near it.
- **Reverse and pause for free.** Scrubbing a video backwards is unreliable across browsers, so frame-sequence sites decode every frame into memory. A live scene has no direction.
- **It answers the pointer.** The camera leans slightly towards the cursor, the water moves, the fire flickers. A film cannot.
- **A new suite is a file.** With frames, every change of furniture or copy means re-rendering. Here it means editing a plan and refreshing.

## What it costs

Realism. A path-traced film has bounced light and soft reflections that I can only approximate with an environment map, a hemisphere light and ambient occlusion. On a weak phone the frame rate drops where a video would not.

## When I would change my mind

If the client already has architectural renders or a film, use them: the frame-sequence approach is better when the footage exists. If it does not, splats captured on site are the next step, not frames.
