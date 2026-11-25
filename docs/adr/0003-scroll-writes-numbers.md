# Scroll writes numbers, the frame reads them

ScrollTrigger scrubs one GSAP timeline per suite. That timeline does not animate any three.js object. It tweens a plain object of numbers: how far along the flight, whether we are inside yet, how much clay is left, how far along the walk, which note is up and how visible it is. The render loop reads that object every frame and places the camera, fades the ceilings and fills in the interface.

## Why

- **Reversibility.** Scrolling up runs the timeline backwards. When every effect is a function of the state, it is correct in both directions without special cases. Callbacks like `onComplete` are not.
- **The camera needs more than one input.** Its position is a blend of the orbit around the maquette and the walking path, plus the pointer. Three tweens fighting over `camera.position` would be worse than one function that computes it.
- **Switching hotels.** Choosing another suite kills the timeline, rebuilds the scene and the state, and creates a new timeline. Nothing in three.js holds a reference to GSAP.

## Consequences

The frame function is long, because it is where everything meets. I kept it in one place rather than splitting it into small updaters, since the order matters (camera before ceilings, ceilings before the render) and is easier to see in one read.
