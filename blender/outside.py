"""What the Deluxe Suite looks out on, in real 3D: west from the 37th floor of
Otemachi Tower, over the moat and the forest of the Imperial Palace East
Gardens, to the towers of Shinjuku and, at sunset, Fuji."""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

import materials as M
from kit import box

FLOOR = 5.2
FLOORS = 38


def smoothstep(x, a, b):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def value_noise(seed):
    rng = np.random.default_rng(seed)
    table = rng.random((256, 256))

    def sample(x, y):
        xi = np.floor(x).astype(int)
        yi = np.floor(y).astype(int)
        xf = x - xi
        yf = y - yi
        u = xf * xf * (3 - 2 * xf)
        v = yf * yf * (3 - 2 * yf)
        a = table[xi & 255, yi & 255]
        b = table[(xi + 1) & 255, yi & 255]
        c = table[xi & 255, (yi + 1) & 255]
        d = table[(xi + 1) & 255, (yi + 1) & 255]
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v

    def fbm(x, y, octaves=5):
        total = np.zeros_like(x, dtype=float)
        amp, freq = 0.5, 1.0
        for _ in range(octaves):
            total += amp * sample(x * freq, y * freq)
            freq *= 2.03
            amp *= 0.5
        return total

    return fbm


def sun_and_sky(suite):
    sx, sy, sz = suite['sun']
    d = Vector((sx, -sz, sy)).normalized()
    world = bpy.data.worlds.new('sky')
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new('ShaderNodeTexSky')
    for kind in ('MULTIPLE_SCATTERING', 'NISHITA', 'SINGLE_SCATTERING', 'HOSEK_WILKIE'):
        try:
            sky.sky_type = kind
            break
        except TypeError:
            continue
    elevation = math.asin(d.z)
    for attr, val in (('sun_elevation', elevation), ('sun_rotation', -math.atan2(d.x, d.y)), ('sun_disc', False),
                      ('air_density', 1.6), ('aerosol_density', 4.0), ('dust_density', 4.0), ('ozone_density', 1.4)):
        if hasattr(sky, attr):
            setattr(sky, attr, val)
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = 1.0
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])

    light = bpy.data.lights.new('sun', 'SUN')
    light.energy = 4.5
    light.angle = math.radians(0.8)
    light.color = (1.0, 0.74, 0.5)
    sun = bpy.data.objects.new('sun', light)
    bpy.context.scene.collection.objects.link(sun)
    sun.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    return sun


def merged(name, parts, mat, coll, roof=None):
    """Many boxes in one mesh: the city is thousands of buildings and one object."""
    bm = bmesh.new()
    for (w, d, h), (x, y, z), rot in parts:
        verts = bmesh.ops.create_cube(bm, size=1.0)['verts']
        bmesh.ops.scale(bm, vec=(w, d, h), verts=verts)
        bmesh.ops.rotate(bm, verts=verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rot, 3, 'Z'))
        bmesh.ops.translate(bm, vec=(x, y, z + h / 2), verts=verts)
        if roof is not None:
            for f in {f for v in verts for f in v.link_faces}:
                if f.normal.z > 0.9:
                    f.material_index = 1
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    if roof is not None:
        me.materials.append(roof)
    obj = bpy.data.objects.new(name, me)
    coll.objects.link(obj)
    return obj


def heightfield(name, x0, x1, y0, y1, res, height, mat, coll):
    xs = np.linspace(x0, x1, res)
    ys = np.linspace(y0, y1, max(2, int(res * (y1 - y0) / (x1 - x0))))
    X, Y = np.meshgrid(xs, ys)
    Z = height(X, Y)
    rows, cols = X.shape
    verts = np.stack([X.ravel(), Y.ravel(), Z.ravel()], axis=1)
    idx = np.arange(rows * cols).reshape(rows, cols)
    faces = np.stack([idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, 1:].ravel(), idx[1:, :-1].ravel()], axis=1)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.tolist(), [], faces.tolist())
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    obj = bpy.data.objects.new(name, me)
    coll.objects.link(obj)
    return obj


def canopy_material():
    """Seen from 190 m up, a forest is a rough green surface with darker hollows
    and a few crowns catching the light. Colour follows height for that."""
    t = M.Tree('canopy')
    geo = t.add('ShaderNodeNewGeometry', -900, 0)
    sep = t.add('ShaderNodeSeparateXYZ', -700, 0)
    t.link(geo, 'Position', sep, 'Vector')
    div = t.add('ShaderNodeMath', -550, 0, operation='DIVIDE')
    div.inputs[1].default_value = 24.0
    t.link(sep, 'Z', div, 0)
    ramp = t.add('ShaderNodeValToRGB', -350, 0)
    # lawns at the bottom, dark hollows between crowns, light on the tops
    ramp.color_ramp.elements[0].color = M.rgb('#5b7440')
    ramp.color_ramp.elements[1].color = M.rgb('#4f6b33')
    hollow = ramp.color_ramp.elements.new(0.22)
    hollow.color = M.rgb('#16260f')
    mid = ramp.color_ramp.elements.new(0.6)
    mid.color = M.rgb('#2f4a22')
    t.link(div, 'Value', ramp, 'Fac')
    leaves = t.add('ShaderNodeTexVoronoi', -550, -250)
    t.set(leaves, Scale=0.35)
    t.link(geo, 'Position', leaves, 'Vector')
    mix = t.add('ShaderNodeMix', 0, 0, data_type='RGBA', blend_type='MULTIPLY')
    t.set(mix, Factor=0.45)
    t.link(ramp, 'Color', mix, 'A')
    t.links.new(leaves.outputs['Color'], mix.inputs[7])
    t.links.new(mix.outputs[2], t.bsdf.inputs['Base Color'])
    t.set(t.bsdf, Roughness=0.95)
    t.bump(leaves, 'Distance', strength=0.6, distance=1.5)
    return t.mat


def build(sc, suite):
    coll = sc.coll('outside')
    z0 = (suite['gauge']['to'] - 1) * FLOOR
    H = suite['height']
    top = FLOORS * FLOOR

    # The suite's window wall is at x = 0, facing west, from y = 0 to y = -7.1.
    # The tower is 46 m square, with the suite in the middle of its west face.
    tx0, tx1, ty0, ty1 = -0.3, 45.7, -26.5, 19.5
    inset = 0.9
    ix0, ix1, iy0, iy1 = tx0 + inset, tx1 - inset, ty0 + inset, ty1 - inset
    band = (z0 - 0.6, z0 + H + 0.7)

    offices = M.windows('tower rooms', wall='#1b1a19', lit=0.22, warm='#ffc58a', floor=FLOOR)
    box(sc, (ix1 - ix0, iy1 - iy0, band[0]), Vector(((ix0 + ix1) / 2, (iy0 + iy1) / 2, band[0] / 2)), offices, bevel=0, coll='outside')
    box(sc, (ix1 - ix0, iy1 - iy0, top - band[1]), Vector(((ix0 + ix1) / 2, (iy0 + iy1) / 2, (top + band[1]) / 2)), offices, bevel=0, coll='outside')
    hb = band[1] - band[0]
    zc = sum(band) / 2
    # the rest of floor 37: other suites to the north and south, the core behind
    box(sc, (ix1 - 0.4, iy1 - 0.4, hb), Vector((ix1 / 2 + 0.2, (0.4 + iy1) / 2, zc)), offices, bevel=0, coll='outside')
    box(sc, (ix1 - 0.4, -7.5 - iy0, hb), Vector((ix1 / 2 + 0.2, (iy0 - 7.5) / 2, zc)), offices, bevel=0, coll='outside')
    box(sc, (ix1 - 10.4, 7.9, hb), Vector(((ix1 + 10.4) / 2, -3.55, zc)), offices, bevel=0, coll='outside')

    curtain = M.glass('curtain', (0.16, 0.18, 0.2, 1))
    stone = M.tiles('cladding', '#4a4744', size=1.3, rough=0.5)
    faces = (((tx0, ty1), (tx0, ty0)), ((tx0, ty0), (tx1, ty0)), ((tx1, ty0), (tx1, ty1)), ((tx1, ty1), (tx0, ty1)))
    for n, ((ax, ay), (bx, by)) in enumerate(faces):
        length = math.hypot(bx - ax, by - ay)
        ang = math.atan2(by - ay, bx - ax)
        mid = Vector(((ax + bx) / 2, (ay + by) / 2, 0))
        along = Vector((math.cos(ang), math.sin(ang), 0))
        normal = Vector((along.y, -along.x, 0))
        spans = [(0, top)]
        if n == 0:
            # leave the glass out where the suite's own window is the facade
            spans = [(0, band[0] + 0.4), (band[1] - 0.4, top)]
        for z_a, z_b in spans:
            g = box(sc, (length, 0.03, z_b - z_a), mid + Vector((0, 0, (z_a + z_b) / 2)), curtain, bevel=0, coll='outside')
            g.rotation_euler.z = ang
            g.visible_shadow = False
        # deep stone fins every bay and a spandrel at every floor: Otemachi Tower's grid
        k = 0.0
        while k <= length + 0.01:
            fin = box(sc, (0.22, 0.3, top), mid + along * (k - length / 2) + normal * 0.13 + Vector((0, 0, top / 2)), stone, bevel=0.01, coll='outside')
            fin.rotation_euler.z = ang
            k += 4.6
        for f in range(1, FLOORS + 1):
            sp = box(sc, (length + 0.6, 0.4, 0.55), mid + normal * 0.2 + Vector((0, 0, f * FLOOR - 0.25)), stone, bevel=0.006, coll='outside')
            sp.rotation_euler.z = ang
    box(sc, (47.5, 47.5, 4.0), Vector(((tx0 + tx1) / 2, (ty0 + ty1) / 2, top + 2.0)), stone, bevel=0.02, coll='outside')

    # The palace: a moat with stone walls, then a forest a kilometre and a half across.
    fbm = value_noise(4)
    px0, px1, py0, py1 = -1650.0, -170.0, -720.0, 760.0

    def canopy(X, Y):
        inside = smoothstep(X, px0, px0 + 60) * smoothstep(-X, -px1, -px1 + 60) * smoothstep(Y, py0, py0 + 60) * smoothstep(-Y, -py1, -py1 + 60)
        lawn = smoothstep(fbm(X / 260, Y / 260, 3), 0.6, 0.66)
        trees = 8 + fbm(X / 18, Y / 18, 4) * 22 + fbm(X / 4, Y / 4, 2) * 4
        return inside * trees * (1 - lawn * 0.92)

    heightfield('palace forest', px0, px1, py0, py1, 700, canopy, canopy_material(), coll)
    moat = M.water('moat', '#425651')
    walls = M.tiles('moat walls', '#a8a196', size=0.8, rough=0.8)
    for (sx, sy, cx, cy) in ((px1 - px0 + 120, 40, (px0 + px1) / 2, py0 - 20), (px1 - px0 + 120, 40, (px0 + px1) / 2, py1 + 20),
                             (40, py1 - py0, px0 - 20, (py0 + py1) / 2), (40, py1 - py0, px1 + 20, (py0 + py1) / 2)):
        box(sc, (sx, sy, 0.4), Vector((cx, cy, -0.6)), moat, bevel=0, coll='outside')
        box(sc, (sx + 6, sy + 6, 2.0), Vector((cx, cy, -1.6)), walls, bevel=0, coll='outside')
    plaster = M.plain('palace walls', '#ddd8cc', rough=0.8)
    copper = M.plain('palace roofs', '#4d5a53', rough=0.6, metal=0.3)
    for x, y, w, d in ((-930, 40, 120, 45), (-860, -120, 70, 50), (-1100, 210, 60, 30)):
        box(sc, (w, d, 9), Vector((x, y, 4.5)), plaster, bevel=0.2, coll='outside')
        box(sc, (w + 4, d + 4, 3), Vector((x, y, 10)), copper, bevel=0.8, coll='outside')

    # Tokyo everywhere else: low and dense, taller towards Marunouchi and Shinjuku.
    rng = np.random.default_rng(9)
    parts = []
    for i in range(9000):
        a = i * 2.39996
        r = 70 + math.sqrt(i / 9000) * 7800
        x = 23 + math.cos(a) * r
        y = -3 + math.sin(a) * r
        if px0 - 90 < x < px1 + 90 and py0 - 90 < y < py1 + 90:
            continue
        if -8 < x < 60 and -40 < y < 32:
            continue
        n = float(fbm(np.array([x / 400]), np.array([y / 400]))[0])
        h = 9 + n ** 3 * 160 * (1.4 if x > -100 else 0.8)
        w = 14 + rng.random() * 36
        parts.append(((w, w * (0.6 + rng.random() * 0.8), h), (x, y, 0), round(a) * 0.1))
    # Shinjuku: a cluster of towers on the horizon, a little north of west
    for _ in range(34):
        w = 30 + rng.random() * 30
        parts.append(((w, w, 120 + rng.random() * 130), (-6400 + rng.normal(0, 260), 380 + rng.normal(0, 380), 0), rng.random()))
    # the office towers right next door in Otemachi and Marunouchi
    for x, y, h in ((-40, 95, 150), (30, 110, 175), (-60, -95, 140), (20, -120, 165), (90, 60, 120)):
        parts.append(((44, 40, h), (x, y, 0), 0.0))
    merged('tokyo', parts, M.windows('tokyo', wall='#3c3f45', lit=0.08, warm='#ffd19a'), coll, roof=M.plain('roofs', '#5d5c5f', rough=0.85))

    box(sc, (40000, 40000, 1), Vector((0, 0, -0.5)), M.plain('streets', '#4a4a4c', rough=0.95), bevel=0, coll='outside')

    # Fuji is 100 km away; at a quarter of the distance and a quarter of the size it sits in the same place in frame
    snow = M.plain('snow', '#e9e6ef', rough=0.7)
    rock = M.plain('fuji', '#5c5a6e', rough=1.0)
    for name, r1, depth, z, mat in (('fuji', 2600, 950, 475, rock), ('fuji snow', 900, 330, 787, snow)):
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=128, radius1=r1, radius2=170, depth=depth)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        cone = bpy.data.objects.new(name, me)
        coll.objects.link(cone)
        cone.location = (-23000, -9800, z)

    eye = Vector((0, -4.8, z0))
    return {
        'z0': z0,
        'pos': [Vector((-950, 240, 230)), Vector((-520, 110, 215)), eye + Vector((-170, 10, 14)), eye + Vector((-14, 0, 1.6))],
        'look': [Vector((23, -3, 160)), Vector((10, -4, 195)), eye + Vector((0, 0, 2)), eye + Vector((3, 0, 1.2))],
    }
