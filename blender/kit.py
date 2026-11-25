"""Meshes and furniture. Everything is modelled at real size, in metres.

Plan coordinates come from the web side, where y is up and z points south.
Here z is up, so a plan point (x, z) lands at (x, -z) and a rotation about
the web's y axis is the same angle about Blender's z.
"""

import math

import bmesh
import bpy
from mathutils import Vector

import materials as M


def plan(x, z, h=0.0):
    return Vector((x, -z, h))


class Scene:
    """Holds the collections and the material palette while a suite is built."""

    def __init__(self, palette):
        self.palette = palette
        self.cache = {}
        self.collections = {}

    def coll(self, name):
        if name not in self.collections:
            c = bpy.data.collections.new(name)
            bpy.context.scene.collection.children.link(c)
            self.collections[name] = c
        return self.collections[name]

    def mat(self, role):
        if role not in self.cache:
            self.cache[role] = self.palette(role)
        return self.cache[role]


def link(obj, coll):
    for c in obj.users_collection:
        c.objects.unlink(obj)
    coll.objects.link(obj)


def mesh_object(name, bm, mat, coll, parent=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    coll.objects.link(obj)
    if mat:
        me.materials.append(mat)
    if parent:
        obj.parent = parent
    # a flat box shaded smooth refracts like a lens, so only bevelled or round shapes get smoothing
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return obj


def box(sc, size, at, mat, bevel=0.006, coll='suite', parent=None, segments=3, name='box'):
    w, d, h = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= w
        v.co.y *= d
        v.co.z *= h
    obj = mesh_object(name, bm, sc.mat(mat) if isinstance(mat, str) else mat, sc.coll(coll), parent, smooth=bevel > 0)
    obj.location = at
    if bevel > 0:
        b = obj.modifiers.new('bevel', 'BEVEL')
        b.width = min(bevel, w / 2.2, d / 2.2, h / 2.2)
        b.segments = segments
        b.limit_method = 'ANGLE'
        b.harden_normals = True
        obj.modifiers.new('normals', 'WEIGHTED_NORMAL').keep_sharp = True
    return obj


def soft(sc, size, at, mat, give=0.05, coll='suite', parent=None, name='cushion'):
    """Upholstery: a heavily bevelled box, then subdivided so the edges sag a little."""
    obj = box(sc, size, at, mat, bevel=give, coll=coll, parent=parent, segments=4, name=name)
    s = obj.modifiers.new('soft', 'SUBSURF')
    s.levels = s.render_levels = 1
    return obj


def cyl(sc, r, h, at, mat, r2=None, verts=48, coll='suite', parent=None, bevel=0.004, name='cyl'):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=h)
    obj = mesh_object(name, bm, sc.mat(mat) if isinstance(mat, str) else mat, sc.coll(coll), parent)
    obj.location = at
    if bevel:
        b = obj.modifiers.new('bevel', 'BEVEL')
        b.width = bevel
        b.segments = 2
        b.limit_method = 'ANGLE'
    return obj


def empty(sc, name, at, rot_deg=0.0, coll='suite'):
    e = bpy.data.objects.new(name, None)
    sc.coll(coll).objects.link(e)
    e.location = at
    e.rotation_euler = (0, 0, math.radians(rot_deg))
    return e


def point(sc, at, energy=40.0, color=(1.0, 0.8, 0.6), radius=0.08, parent=None):
    light = bpy.data.lights.new('lamp', 'POINT')
    light.energy = energy
    light.color = color
    light.shadow_soft_size = radius
    obj = bpy.data.objects.new('lamp', light)
    sc.coll('lights').objects.link(obj)
    obj.location = at
    if parent:
        obj.parent = parent
    return obj


# -- furniture ---------------------------------------------------------------
# Modelled from the Deluxe Suite photographs. Every piece is built around a
# local origin on the floor; local -y is the front, +y the back.

def lamp(sc, g, at, lit=False, legs=0.32):
    """Black metal frame, a box of linen on top: the lamps by the beds and the daybed."""
    x, y, z = at
    for dx in (-0.06, 0.06):
        for dy in (-0.06, 0.06):
            box(sc, (0.012, 0.012, legs), (x + dx, y + dy, z + legs / 2), 'dark', bevel=0.002, parent=g)
    box(sc, (0.14, 0.14, 0.012), (x, y, z + legs), 'dark', bevel=0.002, parent=g)
    box(sc, (0.38, 0.26, 0.24), (x, y, z + legs + 0.13), 'shade', bevel=0.004, parent=g)
    point(sc, (x, y, z + legs + 0.12), energy=30 if lit else 16, radius=0.1, parent=g)


def door(sc, p, g):
    w = p.get('w', 1.0)
    box(sc, (w, 0.05, 2.38), (0, 0, 1.19), 'oak', bevel=0.003, parent=g)
    box(sc, (w + 0.12, 0.07, 0.06), (0, 0, 2.41), 'oak', bevel=0.003, parent=g)
    box(sc, (0.02, 0.03, 0.22), (w / 2 - 0.1, -0.04, 1.05), 'dark', bevel=0.003, parent=g)


def wardrobe(sc, p, g):
    w = p.get('w', 2.4)
    doors = max(2, round(w / 0.6))
    dw = w / doors
    box(sc, (w, 0.58, 0.06), (0, 0, 0.03), 'dark', bevel=0, parent=g)
    for i in range(doors):
        x = -w / 2 + dw * (i + 0.5)
        box(sc, (dw - 0.006, 0.04, 2.6), (x, -0.27, 1.36), 'oak', bevel=0.002, parent=g)
        # a finger slot instead of a handle, as in the photographs
        box(sc, (0.012, 0.01, 0.3), (x + (dw / 2 - 0.04) * (1 if i % 2 else -1), -0.295, 1.1), 'dark', bevel=0, parent=g)
    box(sc, (w, 0.56, 2.66), (0, 0.02, 1.36), 'oak', bevel=0, parent=g)


def windowBench(sc, p, g):
    w = p.get('w', 4.4)
    box(sc, (w, 0.84, 0.3), (0, 0, 0.15), 'granite', bevel=0.008, parent=g)
    soft(sc, (w - 0.04, 0.7, 0.13), (0, -0.04, 0.37), 'fabric', give=0.05, parent=g)
    for i, x in enumerate((-w / 2 + 0.55, -w / 2 + 1.3, w / 2 - 1.3, w / 2 - 0.55)):
        c = soft(sc, (0.62, 0.17, 0.48), (x, 0.24, 0.66), 'fabric', give=0.08, parent=g)
        c.rotation_euler = (math.radians(-16), 0, math.radians(3 * (i - 1.5)))
    for x in (-w / 2 + 0.85, w / 2 - 0.95):
        c = soft(sc, (0.42, 0.14, 0.4), (x, 0.08, 0.6), 'throw', give=0.08, parent=g)
        c.rotation_euler = (math.radians(-22), 0, math.radians(12))


def roundTable(sc, p, g):
    cyl(sc, 0.43, 0.035, (0, 0, 0.6), 'oak', verts=96, bevel=0.01, parent=g)
    for a in range(4):
        ang = a * math.pi / 2 + math.pi / 4
        leg = box(sc, (0.035, 0.035, 0.59), (math.cos(ang) * 0.24, math.sin(ang) * 0.24, 0.295), 'oak', bevel=0.004, parent=g)
        leg.rotation_euler.z = ang
    box(sc, (0.3, 0.12, 0.02), (0.02, 0, 0.628), 'dark', bevel=0.004, parent=g)
    for k in range(4):
        cyl(sc, 0.022, 0.025, (-0.09 + k * 0.06, 0, 0.65), 'sweets', verts=16, bevel=0.002, parent=g)


def loungeChair(sc, p, g):
    w = 0.66
    for s in (-1, 1):
        rail = box(sc, (0.035, 0.74, 0.04), (s * (w / 2 - 0.02), 0, 0.32), 'oak', bevel=0.006, parent=g)
        rail.rotation_euler.x = math.radians(4)
        box(sc, (0.035, 0.035, 0.32), (s * (w / 2 - 0.02), -0.32, 0.16), 'oak', bevel=0.005, parent=g)
        back = box(sc, (0.035, 0.035, 0.78), (s * (w / 2 - 0.02), 0.3, 0.38), 'oak', bevel=0.005, parent=g)
        back.rotation_euler.x = math.radians(-14)
    for k in range(8):
        slat = box(sc, (0.035, 0.016, 0.5), (-w / 2 + 0.09 + k * 0.069, 0.36, 0.55), 'oak', bevel=0.003, parent=g)
        slat.rotation_euler.x = math.radians(-14)
    soft(sc, (w - 0.08, 0.64, 0.1), (0, -0.02, 0.39), 'fabric', give=0.04, parent=g)
    back = soft(sc, (w - 0.1, 0.1, 0.44), (0, 0.27, 0.66), 'fabric', give=0.04, parent=g)
    back.rotation_euler.x = math.radians(-14)
    pillow = soft(sc, (0.4, 0.12, 0.36), (0.04, 0.16, 0.6), 'throw', give=0.07, parent=g)
    pillow.rotation_euler = (math.radians(-18), 0, math.radians(-8))


def floorLamp(sc, p, g):
    box(sc, (0.3, 0.3, 0.02), (0, 0, 0.01), 'dark', bevel=0.003, parent=g)
    lamp(sc, g, (0, 0, 0.02), lit=p.get('light'), legs=1.12)


def slats(sc, p, g):
    w = p.get('w', 1.6)
    h = p.get('h', 2.6)
    box(sc, (w, 0.02, h), (0, 0.03, h / 2), 'oak', bevel=0, parent=g)
    n = int(w / 0.08)
    for k in range(n):
        box(sc, (0.04, 0.05, h), (-w / 2 + 0.04 + k * (w / n), -0.01, h / 2), 'oak', bevel=0.004, parent=g)


def footTable(sc, p, g):
    w = p.get('w', 2.4)
    box(sc, (w, 0.62, 0.05), (0, 0, 0.44), 'oak', bevel=0.006, parent=g)
    box(sc, (w - 0.1, 0.56, 0.035), (0, 0, 0.12), 'oak', bevel=0.004, parent=g)
    for s in (-1, 1):
        box(sc, (0.05, 0.6, 0.42), (s * (w / 2 - 0.05), 0, 0.21), 'oak', bevel=0.005, parent=g)
    box(sc, (w - 0.3, 0.5, 0.06), (0, 0, 0.03), 'dark', bevel=0, parent=g)
    # the lacquer tray and the tea things in the photographs
    box(sc, (0.62, 0.38, 0.025), (0.25, 0, 0.478), 'lacquer', bevel=0.006, parent=g)
    cyl(sc, 0.06, 0.15, (0.05, 0.02, 0.565), 'dark', verts=32, bevel=0.006, parent=g)
    for k in range(2):
        cyl(sc, 0.035, 0.05, (0.3 + k * 0.1, 0.06, 0.515), 'ceramic', r2=0.03, verts=24, bevel=0.003, parent=g)


def tatami(sc, p, g):
    w = p.get('w', 2.0)
    d = p.get('d', 1.0)
    box(sc, (w - 0.12, d - 0.12, 0.022), (0, 0, 0.011), 'tatami', bevel=0.002, parent=g)
    for (sx, sy, ax, ay) in ((w, 0.06, 0, d / 2 - 0.03), (w, 0.06, 0, -d / 2 + 0.03), (0.06, d - 0.12, w / 2 - 0.03, 0), (0.06, d - 0.12, -w / 2 + 0.03, 0)):
        box(sc, (sx, sy, 0.024), (ax, ay, 0.012), 'border', bevel=0.003, parent=g)


def twinBeds(sc, p, g):
    l = 2.15
    box(sc, (2.3, l + 0.1, 0.12), (0, 0, 0.2), 'oak', bevel=0.008, parent=g)
    box(sc, (2.0, l - 0.2, 0.14), (0, 0, 0.07), 'dark', bevel=0, parent=g)
    for s in (-1, 1):
        x = s * 0.53
        soft(sc, (1.03, l - 0.05, 0.22), (x, 0, 0.37), 'linen', give=0.06, parent=g)
        soft(sc, (1.08, l * 0.8, 0.05), (x, -l * 0.08, 0.5), 'linen', give=0.025, parent=g)
        soft(sc, (1.1, 0.05, 0.25), (x, -l / 2, 0.4), 'linen', give=0.02, parent=g)
        for k, (z, tilt) in enumerate(((0.62, -24), (0.6, -12))):
            pl = soft(sc, (0.86 - k * 0.05, 0.22, 0.5 - k * 0.06), (x, l / 2 - 0.2 - k * 0.2, z), 'linen', give=0.09, parent=g)
            pl.rotation_euler.x = math.radians(tilt)
        c = soft(sc, (0.38, 0.12, 0.3), (x + 0.05, l / 2 - 0.55, 0.6), 'throw', give=0.06, parent=g)
        c.rotation_euler = (math.radians(-20), 0, math.radians(-10 * s))
        # the charcoal runner across the foot, finished with a black edge
        soft(sc, (1.12, 0.62, 0.03), (x, -l / 2 + 0.42, 0.535), 'throw', give=0.012, parent=g)
        soft(sc, (1.12, 0.06, 0.032), (x, -l / 2 + 0.1, 0.535), 'border', give=0.01, parent=g)
        soft(sc, (1.12, 0.03, 0.2), (x, -l / 2 - 0.05, 0.44), 'throw', give=0.01, parent=g)


def headboard(sc, p, g):
    w = p.get('w', 3.2)
    box(sc, (w, 0.45, 0.06), (0, 0, 0.98), 'oak', bevel=0.006, parent=g)
    box(sc, (w, 0.06, 0.95), (0, -0.19, 0.48), 'oak', bevel=0.004, parent=g)
    box(sc, (w - 0.04, 0.4, 0.92), (0, 0.02, 0.46), 'oak', bevel=0, parent=g)
    for s in (-1, 1):
        x = s * (w / 2 - 0.3)
        box(sc, (0.5, 0.3, 0.03), (x, -0.36, 0.58), 'oak', bevel=0.004, parent=g)
        lamp(sc, g, (x, 0.02, 1.01), lit=p.get('light') and s > 0, legs=0.28)
    box(sc, (0.22, 0.02, 0.1), (-w / 2 + 0.3, -0.225, 0.85), 'panel', bevel=0.003, parent=g)


def console(sc, p, g):
    w = p.get('w', 1.4)
    box(sc, (w, 0.32, 0.035), (0, 0, 0.78), 'oak', bevel=0.005, parent=g)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(sc, (0.04, 0.04, 0.76), (sx * (w / 2 - 0.1), sy * 0.12, 0.38), 'oak', bevel=0.004, parent=g)
        box(sc, (0.035, 0.24, 0.035), (sx * (w / 2 - 0.1), 0, 0.14), 'oak', bevel=0.003, parent=g)
    box(sc, (w - 0.2, 0.035, 0.035), (0, 0, 0.14), 'oak', bevel=0.003, parent=g)


def art(sc, p, g):
    w = p.get('w', 0.55)
    h = p.get('h', 0.75)
    box(sc, (w + 0.02, 0.025, h + 0.02), (0, 0, 0), 'oak', bevel=0.002, parent=g)
    box(sc, (w, 0.01, h), (0, -0.015, 0), 'art', bevel=0, parent=g)


def bonsai(sc, p, g):
    cyl(sc, 0.12, 0.13, (0, 0, 0.065), 'pot', r2=0.1, verts=48, bevel=0.015, parent=g)
    cyl(sc, 0.105, 0.01, (0, 0, 0.13), 'soil', verts=32, bevel=0, parent=g)
    trunk = [(0, 0, 0.13), (0.03, 0.01, 0.2), (-0.02, 0.02, 0.28), (0.04, -0.01, 0.34)]
    for a, b in zip(trunk, trunk[1:]):
        va, vb = Vector(a), Vector(b)
        seg = cyl(sc, 0.012, (vb - va).length, (va + vb) / 2, 'bark', verts=8, bevel=0, parent=g)
        seg.rotation_euler = (vb - va).to_track_quat('Z', 'Y').to_euler()
    tex = bpy.data.textures.get('foliage') or bpy.data.textures.new('foliage', 'CLOUDS')
    tex.noise_scale = 0.02
    for x, y, z, r in ((0.05, 0, 0.35, 0.07), (-0.06, 0.03, 0.3, 0.06), (0.1, -0.02, 0.28, 0.05), (0, 0.04, 0.4, 0.05)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r)
        clump = bpy.context.active_object
        link(clump, sc.coll('suite'))
        clump.parent = g
        clump.location = (x, y, z)
        clump.scale = (1.2, 1.0, 0.6)
        clump.data.materials.append(sc.mat('leaf'))
        d = clump.modifiers.new('rough', 'DISPLACE')
        d.texture = tex
        d.strength = 0.03


def desk(sc, p, g):
    w = p.get('w', 1.4)
    box(sc, (w, 0.6, 0.035), (0, 0, 0.745), 'oak', bevel=0.006, parent=g)
    for s in (-1, 1):
        box(sc, (0.035, 0.56, 0.73), (s * (w / 2 - 0.035), 0, 0.365), 'oak', bevel=0.005, parent=g)
    c = bpy.data.objects.new('desk chair', None)
    sc.coll('suite').objects.link(c)
    c.parent = g
    c.location = (0.1, -0.62, 0)
    c.rotation_euler.z = math.radians(190)
    loungeChair(sc, {}, c)
    lamp(sc, g, (-w / 2 + 0.25, 0.1, 0.76), lit=p.get('light'), legs=0.3)
    box(sc, (0.3, 0.22, 0.015), (0.2, 0.0, 0.77), 'linen', bevel=0.002, parent=g)


def tub(sc, p, g):
    w = p.get('w', 1.7)
    d = p.get('d', 0.95)
    h = 0.62
    outer = box(sc, (w, d, h), (0, 0, h / 2), 'basalt', bevel=0.01, segments=3, parent=g)
    cutter = box(sc, (w - 0.16, d - 0.16, h), (0, 0, h / 2 + 0.08), 'basalt', bevel=0, parent=g)
    cut = outer.modifiers.new('hollow', 'BOOLEAN')
    cut.object = cutter
    cut.operation = 'DIFFERENCE'
    outer.modifiers.move(len(outer.modifiers) - 1, 0)
    cutter.hide_render = cutter.hide_viewport = True
    box(sc, (w - 0.17, d - 0.17, 0.01), (0, 0, h - 0.07), 'water', bevel=0, parent=g)
    box(sc, (w + 0.04, 0.05, 0.03), (0, d / 2 - 0.02, h + 0.015), 'basalt', bevel=0.004, parent=g)


def vanity(sc, p, g):
    w = p.get('w', 2.2)
    box(sc, (w, 0.52, 0.1), (0, -0.02, 0.83), 'oak', bevel=0.004, parent=g)
    box(sc, (w, 0.5, 0.03), (0, -0.01, 0.895), 'basalt', bevel=0.003, parent=g)
    for s in (-1, 1):
        x = s * w * 0.24
        bowl = box(sc, (0.44, 0.36, 0.34), (x, -0.06, 0.74), 'basalt', bevel=0.006, parent=g)
        hollow = box(sc, (0.36, 0.28, 0.3), (x, -0.06, 0.87), 'basalt', bevel=0, parent=g)
        m = bowl.modifiers.new('basin', 'BOOLEAN')
        m.object = hollow
        m.operation = 'DIFFERENCE'
        bowl.modifiers.move(len(bowl.modifiers) - 1, 0)
        hollow.hide_render = hollow.hide_viewport = True
        box(sc, (0.025, 0.16, 0.025), (x, 0.15, 1.02), 'chrome', bevel=0.006, parent=g)
        for k in (-1, 1):
            cyl(sc, 0.016, 0.03, (x + k * 0.1, 0.24, 1.02), 'chrome', verts=24, bevel=0.003, parent=g).rotation_euler.x = math.pi / 2
    box(sc, (w + 0.04, 0.04, 1.0), (0, 0.24, 1.6), 'oak', bevel=0.003, parent=g)
    box(sc, (w - 0.04, 0.02, 0.94), (0, 0.215, 1.6), 'mirror', bevel=0, parent=g)
    for k, x in enumerate((-w / 2 + 0.12, -w / 2 + 0.24, w / 2 - 0.16)):
        cyl(sc, 0.035, 0.12 + k * 0.03, (x, 0.12, 0.97 + k * 0.015), 'dark', verts=24, bevel=0.004, parent=g)


def stool(sc, p, g):
    box(sc, (0.46, 0.3, 0.03), (0, 0, 0.44), 'oak', bevel=0.004, parent=g)
    for k in range(5):
        box(sc, (0.46, 0.035, 0.012), (0, -0.12 + k * 0.06, 0.462), 'oak', bevel=0.002, parent=g)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(sc, (0.035, 0.035, 0.44), (sx * 0.2, sy * 0.12, 0.22), 'oak', bevel=0.003, parent=g)
    box(sc, (0.44, 0.24, 0.02), (0, 0, 0.14), 'oak', bevel=0.003, parent=g)
    soft(sc, (0.32, 0.22, 0.1), (0, 0, 0.51), 'linen', give=0.03, parent=g)


KINDS = {f.__name__: f for f in (door, wardrobe, windowBench, roundTable, loungeChair, floorLamp, slats, footTable,
                                 tatami, twinBeds, headboard, console, art, bonsai, desk, tub, vanity, stool)}


def furnish(sc, p, floor_z):
    x, z = p['at']
    g = empty(sc, p['kind'], plan(x, z, floor_z + p.get('y', 0.0)), p.get('rot', 0.0))
    KINDS[p['kind']](sc, p, g)
    return g
