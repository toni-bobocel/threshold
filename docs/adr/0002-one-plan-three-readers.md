# One plan, three readers

A suite is described once, as data: rooms, walls with their openings, furniture, and the stops of the walk. The Blender builder, the camera path and the minimap all read the same description. (The builder was three.js at first; see ADR 4.)

## Why

The first version had the camera path written separately from the geometry, and the two drifted: I moved a doorway and the camera kept walking through where it used to be. With one description, moving a door moves the opening in the wall, the gap in the minimap, and the test that checks the walk goes through doorways.

That test (`walk.test.ts`) is the real reason for the format. It samples the camera curve and checks every step against every solid stretch of wall. It found three collisions in the first draft of the suites, all in places where the curve swung wide between two stops.

## Consequences

- The format only knows straight walls on a grid and rooms that are rectangles. Curved walls or split levels would need new fields. None of the three suites needed them, so I did not add them.
- Furniture is a small parametric kit in `blender/kit.py` rather than bought models. It keeps the plan readable (`{ kind: 'sofa', at: [3.6, -0.85], rot: 180 }`) but limits how specific a room can look. A real project would let a piece point at the manufacturer's model instead. A test checks that every kind used in a plan exists in the kit.
