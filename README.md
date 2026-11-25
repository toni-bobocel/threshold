# threshold

The aman.com home page, rebuilt, with one thing added: before booking, you can walk through the room.

Scroll and the camera flies in over the Imperial Palace gardens to the 37th floor of Otemachi Tower, where a Deluxe Suite at Aman Tokyo appears as a white architect's model, colours itself in, and then lets you walk through it: the entrance, the bed, the daybed at the window, the furo in the bathroom. A note in each room, a small plan in the corner showing where you are. Scroll back up and all of it plays in reverse.

This is an unofficial concept. I have no connection to Aman. Their name, logo and photographs load from aman.com and belong to them. The suite is modelled from the photographs and description of the Deluxe Suite on their site, so the layout is my reading of it, not a survey.

![The Tokyo suite as a maquette, then from the living room](docs/img/tokyo.jpg)

## Why

Luxury hotel sites sell rooms with photographs, and photographs are good at mood and bad at space. You cannot tell from six pictures whether the bath is in the bedroom, how far the bed is from the window, or what you see from the sofa. A floor plan answers that, but nobody reads floor plans.

A walk-through answers it without asking anyone to read anything. The reference I worked from was a property-developer site that does this with a rendered film scrubbed by scroll. I wanted the same quality, generated from a plan written as data, so that another room means another file and a render, not a commission.

I started with three invented suites at three hotels and ended with one real room. One room done properly makes the case better than three done roughly.

## How it works

The suite is one TypeScript file, `src/suites/tokyo.ts`: rooms as rectangles, walls as segments with their doors and windows, furniture by kind and position, and the stops of the walk with what to say at each. That one description feeds three things:

- **Blender** (`blender/`) builds it by script: washi walls with an oak rail and skirting, shoji with translucent paper, a ceiling with a lit cove, glazing with real glass, bevelled and subdivided upholstery, the furniture from the photographs (the daybed on its stone ledge, the slatted chairs, the twin beds on a camphor platform, the linen-shaded lamps), floors and stone from procedural node materials, a physical sky with the sun low in the west, and portals on the windows so Cycles samples daylight cleanly. Outside is real geometry: the tower's stone grid, the moat and the forest of the palace gardens, nine thousand blocks of Tokyo, Shinjuku on the horizon and Fuji behind it.
- **The camera path** is a centripetal Catmull-Rom curve through the stops. Blender renders it frame by frame with Cycles; a second pass renders the maquette in white clay with a material override.
- **The minimap** is drawn as SVG from the same rooms and walls. Blender writes the camera's position for every frame next to the images.

In the browser, a GSAP timeline driven by ScrollTrigger turns scroll into a frame number, and a canvas draws that frame, cross-fading into the next for the fraction in between. Frames arrive as WebP, coarse first and then the gaps, and only the ones near the playhead are decoded, off the main thread. The page does no 3D work at all, which is why it stays smooth.

`src/tour/walk.test.ts` checks that the walk never passes through a wall, using the same curve Blender renders, and that every piece of furniture in the plan is one Blender knows how to build. It caught three collisions while I was writing the first plans, which is three re-renders I did not have to wait for.

## Running it

```sh
pnpm install
pnpm dev        # http://localhost:5178
pnpm test
pnpm lint
pnpm build      # typecheck, then build to dist/
```

The rendered frames live in `public/frames/`. To render them again you need Blender 5.1 and ffmpeg:

```sh
node scripts/suites-json.ts         # plans → blender/suites.json
sh blender/render-all.sh            # Cycles, GPU, about 75 min; skips frames already rendered
sh blender/encode.sh tokyo
```

To look at a few frames before committing an hour to it:

```sh
blender -b --factory-startup --python blender/render.py -- tokyo colour --every 40 --scale 50 --samples 32
```

Node 24. Set `BASE=/threshold/` when building for GitHub Pages; the Pages workflow does it for you.

## Adding a room

Copy `src/suites/tokyo.ts`, change the plan, mount it from `src/main.ts`, and run the tests. They will tell you if the walk goes through a wall, if a stop is off the plan, or if you used a piece of furniture Blender does not know. Then render a frame in forty and look at it, because the tests cannot tell you whether it is any good.

## Trade-offs

- **Frames, not live 3D.** I built it live in three.js first. It was lighter and it answered the pointer, but it looked like a game and stuttered on laptops. [ADR 1](docs/adr/0001-live-3d-not-frames.md) has the case for it, [ADR 4](docs/adr/0004-frames-from-blender-after-all.md) why I reversed it.
- **Weight.** Close to five hundred frames. They stream in progressively and phones get a smaller set, but this is a page you open on wifi.
- **Fonts.** Aman's Lyon and Whitney are licensed, so Spectral and Hanken Grotesk stand in.
- **The hero film.** Aman's Vimeo film only plays on aman.com, so a still of the same resort drifts in its place.

## What I would do with a real client

The plan would come from the architects' drawings rather than from photographs, and the furniture from the manufacturers' models instead of my kit. I would render at 1920 and serve the frames from a CDN as AVIF, render a night version of each walk, and move the notes into the CMS that runs the rest of the site so the sales team can change them without me. Rendering would move to a farm, triggered by a change to a plan file.

## Licence

MIT for the code. Nothing here grants any right to Aman's name, logo or photographs.
