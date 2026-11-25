"""The world around each suite, in real 3D this time: the view from the window
is the same geometry the camera flies over on the way in."""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

import kit
import materials as M
from kit import box


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
    # golden hour: whatever the plan says, keep the sun low enough to colour the sky
    elevation = min(math.asin(d.z), math.radians(1.8))
    d = Vector((d.x, d.y, 0)).normalized() * math.cos(elevation) + Vector((0, 0, math.sin(elevation)))
    rotation = math.atan2(d.x, d.y)
    for attr, val in (('sun_elevation', elevation), ('sun_rotation', -rotation), ('sun_disc', False),
                      ('air_density', 1.6), ('aerosol_density', 4.0), ('dust_density', 4.0), ('ozone_density', 1.4)):
        if hasattr(sky, attr):
            setattr(sky, attr, val)
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = 1.0
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])

    light = bpy.data.lights.new('sun', 'SUN')
    light.energy = 4.2
    light.angle = math.radians(1.2)
    light.color = (1.0, 0.82, 0.62)
    sun = bpy.data.objects.new('sun', light)
    bpy.context.scene.collection.objects.link(sun)
    sun.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    return sun


def merged(name, parts, mat, coll, roof=None):
    """Many boxes in one mesh: the city is thousands of buildings and one object."""
    bm = bmesh.new()
    for (w, d, h), (x, y, z), rot in parts:
        geom = bmesh.ops.create_cube(bm, size=1.0)
        verts = geom['verts']
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


def terrain(name, size, res, height, mat, coll):
    xs = np.linspace(-size / 2, size / 2, res)
    X, Y = np.meshgrid(xs, xs)
    Z = height(X, Y)
    me = bpy.data.meshes.new(name)
    verts = np.stack([X.ravel(), Y.ravel(), Z.ravel()], axis=1)
    idx = np.arange(res * res).reshape(res, res)
    a = idx[:-1, :-1].ravel()
    b = idx[:-1, 1:].ravel()
    c = idx[1:, 1:].ravel()
    d = idx[1:, :-1].ravel()
    faces = np.stack([a, b, c, d], axis=1)
    me.from_pydata(verts.tolist(), [], faces.tolist())
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    obj = bpy.data.objects.new(name, me)
    coll.objects.link(obj)
    return obj


def scatter(name, count, place, radius, mat, coll, subdiv=1, squash=0.6):
    bm = bmesh.new()
    for i in range(count):
        p = place(i)
        if p is None:
            continue
        r = radius(i)
        geom = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
        bmesh.ops.scale(bm, vec=(1, 1, squash), verts=geom['verts'])
        bmesh.ops.translate(bm, vec=p, verts=geom['verts'])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    obj = bpy.data.objects.new(name, me)
    coll.objects.link(obj)
    return obj


# -- Tokyo -----------------------------------------------------------------

FLOOR = 5.2
FLOORS = 38


def tokyo(sc, suite):
    coll = sc.coll('outside')
    level = suite['gauge']['to']
    z0 = (level - 1) * FLOOR
    # the tower's north-east corner is the suite's: glass on two sides
    tx0, tx1, ty0, ty1 = 7.25 - 46, 7.25, 5.25 - 46, 5.25
    top = FLOORS * FLOOR

    office = M.windows('offices', wall='#20242b', lit=0.2)
    aman = M.windows('aman floors', wall='#1e1c1b', lit=0.6, warm='#ffc786')
    inset = 0.7
    ix0, ix1, iy0, iy1 = tx0 + inset, tx1 - inset, ty0 + inset, ty1 - inset
    box(sc, (ix1 - ix0, iy1 - iy0, z0 - 0.6), Vector(((ix0 + ix1) / 2, (iy0 + iy1) / 2, (z0 - 0.6) / 2)), office, bevel=0, coll='outside')
    upper = z0 + suite['height'] + 0.6
    box(sc, (ix1 - ix0, iy1 - iy0, top - upper), Vector(((ix0 + ix1) / 2, (iy0 + iy1) / 2, (top + upper) / 2)), aman, bevel=0, coll='outside')
    band = (z0 - 0.6, upper)
    hb = band[1] - band[0]
    box(sc, (-7.3 - ix0, iy1 - iy0, hb), Vector(((ix0 - 7.3) / 2, (iy0 + iy1) / 2, sum(band) / 2)), aman, bevel=0, coll='outside')
    box(sc, (ix1 + 7.3, -5.3 - iy0, hb), Vector(((ix1 - 7.3) / 2, (iy0 - 5.3) / 2, sum(band) / 2)), aman, bevel=0, coll='outside')

    # tinted, so from outside the tower reads as glass and not as a cut-away
    curtain = M.glass('curtain', (0.3, 0.36, 0.42, 1))
    frame = sc.mat('mullion')
    faces = (((tx0, ty1), (tx1, ty1), 'n'), ((tx1, ty1), (tx1, ty0), 'e'), ((tx1, ty0), (tx0, ty0), 's'), ((tx0, ty0), (tx0, ty1), 'w'))
    for (ax, ay), (bx, by), side in faces:
        length = math.hypot(bx - ax, by - ay)
        ang = math.atan2(by - ay, bx - ax)
        mid = Vector(((ax + bx) / 2, (ay + by) / 2, 0))
        spans = [(0, top)]
        if side in ('n', 'e'):
            spans = [(0, band[0] + 0.5), (band[1] - 0.5, top)]
        for z_a, z_b in spans:
            g = box(sc, (length, 0.03, z_b - z_a), mid + Vector((0, 0, (z_a + z_b) / 2)), curtain, bevel=0, coll='outside')
            g.rotation_euler.z = ang
            g.visible_shadow = False
            for k in range(int(length / 1.6) + 1):
                t = k * 1.6 - length / 2
                m = box(sc, (0.06, 0.14, z_b - z_a), mid + Vector((math.cos(ang) * t, math.sin(ang) * t, (z_a + z_b) / 2)), frame, bevel=0, coll='outside')
                m.rotation_euler.z = ang
        f = 1
        while f * FLOOR < top:
            z = f * FLOOR
            if not (band[0] < z < band[1]) or side in ('s', 'w'):
                sp = box(sc, (length + 0.2, 0.3, 0.4), mid + Vector((0, 0, z - 0.2)), frame, bevel=0, coll='outside')
                sp.rotation_euler.z = ang
            f += 1
    box(sc, (47, 47, 3.0), Vector(((tx0 + tx1) / 2, (ty0 + ty1) / 2, top + 1.5)), frame, bevel=0, coll='outside')

    # Tokyo: thousands of blocks, low near the tower and clear of the palace grounds to the west
    noise = value_noise(4)
    rng = np.random.default_rng(9)
    parts = []
    for i in range(5200):
        a = i * 2.39996
        r = 120 + math.sqrt(i / 5200) * 3200
        x = (tx0 + tx1) / 2 + math.cos(a) * r
        y = (ty0 + ty1) / 2 + math.sin(a) * r
        if -1300 < x < -250 and abs(y) < 650:
            continue
        # keep the approach clear: nothing on the line the camera flies in along
        along = (x - 7) * 0.7071 + (y - 5) * 0.7071
        across = abs(-(x - 7) * 0.7071 + (y - 5) * 0.7071 - 260 * min(1, max(0, along / 720)))
        if along > 30 and across < 140:
            continue
        n = float(noise(np.array([x / 300]), np.array([y / 300]))[0])
        h = 12 + n ** 3 * min(170, r * 0.2) * 2.2
        w = 16 + rng.random() * 34
        parts.append(((w, w * (0.6 + rng.random() * 0.8), h), (x, y, 0), round(a) * 0.1))
    roofs = M.plain('roofs', '#55545a', rough=0.8)
    merged('city', parts, M.windows('city', wall='#262a32', lit=0.1), coll, roof=roofs)

    ground = box(sc, (12000, 12000, 1), Vector((0, 0, -0.5)), M.plain('streets', '#3a3a3d', rough=0.95), bevel=0, coll='outside')
    ground.name = 'ground'
    garden = M.plain('garden', '#2d4027', rough=1.0)
    box(sc, (900, 640, 0.6), Vector((-760, 0, 0.3)), garden, bevel=0, coll='outside')
    moat = box(sc, (960, 700, 0.3), Vector((-760, 0, 0.1)), M.water('moat', '#5f7480'), bevel=0, coll='outside')
    moat.name = 'moat'
    scatter('palace trees', 2400, lambda i: (-760 + (rng.random() - 0.5) * 860, (rng.random() - 0.5) * 600, 4),
            lambda i: 3 + rng.random() * 5, M.plain('canopy', '#243b22', rough=1.0), coll)
    fuji = bpy.data.meshes.new('fuji')
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=96, radius1=5200, radius2=420, depth=1900)
    bm.to_mesh(fuji)
    bm.free()
    fuji.materials.append(M.plain('fuji', '#6d6a82', rough=1.0))
    f = bpy.data.objects.new('fuji', fuji)
    coll.objects.link(f)
    f.location = (-26000, 9000, 950)

    corner = Vector((7.0, 5.0, z0))
    out = Vector((1, 1, 0)).normalized()
    side = Vector((-out.y, out.x, 0))
    centre = Vector(((tx0 + tx1) / 2, (ty0 + ty1) / 2, 0))
    return {
        'z0': z0,
        'pos': [corner + out * 520 + side * 200 + Vector((0, 0, 110 - z0)), corner + out * 360 + side * 90 + Vector((0, 0, 150 - z0)),
                corner + out * 110 + Vector((0, 0, 12)), corner + out * 22 + Vector((0, 0, 1.8))],
        'look': [centre + Vector((0, 0, 120)), centre + Vector((0, 0, 160)), corner + Vector((0, 0, 2)), corner - out * 5 + Vector((0, 0, 1.4))],
    }


# -- Amangiri ----------------------------------------------------------------

def amangiri(sc, suite):
    coll = sc.coll('outside')
    fbm = value_noise(7)

    def height(X, Y):
        k = fbm(X / 900, Y / 900, 4)
        mesa = smoothstep(k, 0.52, 0.56) * 170 + smoothstep(k, 0.62, 0.64) * 90
        rough = fbm(X / 120, Y / 120, 3) * 14
        clear = smoothstep(np.hypot(X, Y), 150, 650)
        return (mesa + rough) * clear - 0.4

    rock = M.strata('sandstone', '#a4592f', '#d9a070')
    terrain('desert', 7000, 420, height, rock, coll)
    # past the modelled terrain the floor of the desert just carries on to the horizon
    box(sc, (60000, 60000, 1), Vector((0, 0, -1.2)), M.plain('far desert', '#b97a52', rough=1.0), bevel=0, coll='outside')

    concrete = sc.mat('wall')
    centre = Vector((0, -78, 0))
    for i in range(15):
        a = math.radians(90) + (i - 7) * math.radians(13)
        if i == 7:
            continue  # that one is ours
        p = centre + Vector((math.cos(a), math.sin(a), 0)) * 78
        b = box(sc, (16, 12, 4.2), p + Vector((0, 0, 2.1)), concrete, bevel=0.02, coll='outside')
        b.rotation_euler.z = a - math.pi / 2
        g = box(sc, (12, 0.05, 3.2), p + Vector((math.cos(a), math.sin(a), 0)) * 6.03 + Vector((0, 0, 1.7)), sc.mat('glass'), bevel=0, coll='outside')
        g.rotation_euler.z = a - math.pi / 2
    box(sc, (40, 10, 0.4), centre + Vector((0, 0, -0.15)), sc.mat('water'), bevel=0, coll='outside')

    rng = np.random.default_rng(3)

    def place(i):
        a = i * 2.39996
        r = 26 + math.sqrt(i / 2600) * 1800
        x, y = math.cos(a) * r, math.sin(a) * r
        if abs(x) < 12 and -14 < y < 14:
            return None
        return (x, y, float(height(np.array([x]), np.array([y]))[0]) + 0.2)

    scatter('sage', 2600, place, lambda i: 0.5 + rng.random() * 0.9, M.plain('sage', '#7c7f5e', rough=1.0), coll)

    return {
        'z0': 0.0,
        'pos': [Vector((-1100, 1300, 430)), Vector((-480, 600, 300)), Vector((-110, 170, 70)), Vector((3, 26, 2.4))],
        'look': [Vector((0, 0, 70)), Vector((0, 0, 30)), Vector((0, 0, 4)), Vector((1, 2, 1.5))],
    }


# -- Amanpuri ----------------------------------------------------------------

PLATEAU = 18.0


def amanpuri(sc, suite):
    coll = sc.coll('outside')
    fbm = value_noise(2)

    def height(X, Y):
        land = smoothstep(-Y, -140, 260)
        h = land * (30 + fbm(X / 260, Y / 260, 4) * 90) - 8 + fbm(X / 40, Y / 40, 3) * 6
        flat = 1 - smoothstep(np.hypot(X, Y + 2), 16, 55)
        return h * (1 - flat) + (PLATEAU - 0.45) * flat

    land = M.Tree('headland')
    geo = land.add('ShaderNodeNewGeometry', -900, 0)
    sep = land.add('ShaderNodeSeparateXYZ', -700, 0)
    land.link(geo, 'Position', sep, 'Vector')
    ramp = land.add('ShaderNodeValToRGB', -300, 0)
    ramp.color_ramp.elements[0].position = 0.06
    ramp.color_ramp.elements[0].color = M.rgb('#d9c7a3')
    ramp.color_ramp.elements[1].position = 0.1
    ramp.color_ramp.elements[1].color = M.rgb('#30482b')
    div = land.add('ShaderNodeMath', -500, 0, operation='DIVIDE')
    div.inputs[1].default_value = 40.0
    land.link(sep, 'Z', div, 0)
    land.link(div, 'Value', ramp, 'Fac')
    grass = land.add('ShaderNodeTexNoise', -300, -250)
    land.set(grass, Scale=0.08, Detail=10.0, Roughness=0.7)
    land.link(geo, 'Position', grass, 'Vector')
    vary = land.add('ShaderNodeMix', 100, 0, data_type='RGBA', blend_type='OVERLAY')
    land.set(vary, Factor=0.55)
    land.link(ramp, 'Color', vary, 'A')
    land.links.new(grass.outputs['Color'], vary.inputs[7])
    land.links.new(vary.outputs[2], land.bsdf.inputs['Base Color'])
    land.set(land.bsdf, Roughness=1.0)
    land.bump(grass, 'Fac', strength=0.5, distance=1.0)
    terrain('headland', 4200, 360, height, land.mat, coll)

    sea_mat = M.Tree('sea')
    mp = sea_mat.coords()
    wave = sea_mat.add('ShaderNodeTexNoise', -400, -200)
    sea_mat.set(wave, Scale=0.5, Detail=8.0)
    sea_mat.link(mp, 'Vector', wave, 'Vector')
    sea_mat.set(sea_mat.bsdf, **{'Base Color': M.rgb('#1f5a63'), 'Roughness': 0.04, 'IOR': 1.33, 'Coat Weight': 0.3})
    sea_mat.bump(wave, 'Fac', strength=0.12, distance=0.4)
    box(sc, (12000, 12000, 1), Vector((0, 0, -0.5)), sea_mat.mat, bevel=0, coll='outside')

    # one palm, instanced: three hundred copies cost almost nothing
    proto = bpy.data.collections.new('palm proto')
    sc.collections['palm proto'] = proto
    g = kit.empty(sc, 'palm', (0, 0, 0), coll='palm proto')
    kit.palm(sc, {'h': 8.0}, g, coll='palm proto')
    rng = np.random.default_rng(5)
    for i in range(1400):
        a = i * 2.39996
        r = 18 + (i / 1400) ** 0.8 * 520
        x, y = math.cos(a) * r, math.sin(a) * r - 80
        h = float(height(np.array([x]), np.array([y]))[0])
        if h < 2.5 or (abs(x) < 14 and -8 < y < 16):
            continue
        inst = bpy.data.objects.new('palm', None)
        inst.instance_type = 'COLLECTION'
        inst.instance_collection = proto
        coll.objects.link(inst)
        inst.location = (x, y, h)
        inst.rotation_euler = (rng.normal(0, 0.05), rng.normal(0, 0.05), rng.random() * math.tau)
        s = 0.75 + rng.random() * 0.5
        inst.scale = (s, s, s)

    teak = M.plain('villa teak', '#7b5b40', rough=0.85)
    roof = sc.mat('roof_out')
    for i in range(22):
        x = -260 + i * 25 + math.sin(i * 3.1) * 10
        y = -40 - math.cos(i * 1.7) * 30
        if abs(x) < 30:
            continue
        h = float(height(np.array([x]), np.array([y]))[0])
        body = box(sc, (9, 7, 3.4), Vector((x, y, h + 1.7)), teak, bevel=0.02, coll='outside')
        r = box(sc, (10.5, 8.5, 2.6), Vector((x, y, h + 4.2)), roof, bevel=0.02, coll='outside')
        body.rotation_euler.z = r.rotation_euler.z = math.sin(i) * 0.3

    return {
        'z0': PLATEAU,
        'pos': [Vector((320, 950, 150)), Vector((130, 400, 75)), Vector((30, 95, 40)), Vector((0, 24, PLATEAU + 1.8))],
        'look': [Vector((0, 0, 30)), Vector((0, 0, PLATEAU)), Vector((0, 0, PLATEAU + 2)), Vector((-1, 2, PLATEAU + 1.2))],
    }


BUILDERS = {'city': tokyo, 'desert': amangiri, 'sea': amanpuri}
