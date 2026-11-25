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


_leaf_mesh = None


def leaf_mesh():
    """One curved leaf, shared by every plant through linked data."""
    global _leaf_mesh
    if _leaf_mesh:
        return _leaf_mesh
    bm = bmesh.new()
    rows = 8
    prev = None
    for i in range(rows + 1):
        t = i / rows
        half = math.sin(t * math.pi) * 0.055 * (1.1 - t * 0.4)
        y = t * 0.55
        z = math.sin(t * 1.3) * 0.09 - t * t * 0.12
        row = [bm.verts.new((-half, y, z + abs(half) * 0.4)), bm.verts.new((0, y, z)), bm.verts.new((half, y, z + abs(half) * 0.4))]
        if prev:
            bm.faces.new((prev[0], prev[1], row[1], row[0]))
            bm.faces.new((prev[1], prev[2], row[2], row[1]))
        prev = row
    me = bpy.data.meshes.new('leaf')
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    _leaf_mesh = me
    return me


# -- furniture ---------------------------------------------------------------
# Every piece is built around a local origin on the floor. Local -y is the
# front (where you sit or stand), +y is the back.

def sofa(sc, p, g):
    w = p.get('w', 2.4)
    d = p.get('d', 0.95)
    box(sc, (w - 0.1, d - 0.12, 0.1), (0, 0, 0.05), 'dark', parent=g)
    soft(sc, (w, d, 0.24), (0, 0, 0.22), 'fabric', give=0.04, parent=g)
    for s in (-1, 1):
        soft(sc, (0.2, d, 0.36), (s * (w / 2 - 0.1), 0, 0.42), 'fabric', give=0.06, parent=g)
    seats = max(1, round((w - 0.4) / 0.9))
    sw = (w - 0.4) / seats
    for i in range(seats):
        x = -w / 2 + 0.2 + sw * (i + 0.5)
        soft(sc, (sw - 0.02, d - 0.28, 0.16), (x, -0.1, 0.42), 'fabric', give=0.07, parent=g)
        back = soft(sc, (sw - 0.02, 0.22, 0.46), (x, d / 2 - 0.16, 0.62), 'fabric', give=0.08, parent=g)
        back.rotation_euler.x = math.radians(-10)
    pillow = soft(sc, (0.46, 0.14, 0.42), (-w / 2 + 0.55, d / 2 - 0.34, 0.68), 'linen', give=0.09, parent=g)
    pillow.rotation_euler = (math.radians(-14), 0, math.radians(8))


def armchair(sc, p, g):
    w = p.get('w', 0.85)
    box(sc, (w, 0.82, 0.05), (0, 0, 0.18), 'wood', parent=g)
    for s in (-1, 1):
        box(sc, (0.05, 0.8, 0.56), (s * (w / 2 - 0.025), 0, 0.28), 'wood', bevel=0.012, parent=g)
    soft(sc, (w - 0.12, 0.7, 0.14), (0, -0.04, 0.28), 'fabric', give=0.06, parent=g)
    back = soft(sc, (w - 0.12, 0.14, 0.5), (0, 0.32, 0.6), 'fabric', give=0.06, parent=g)
    back.rotation_euler.x = math.radians(-12)


def lowTable(sc, p, g):
    w = p.get('w', 1.3)
    d = p.get('d', 0.8)
    box(sc, (w, d, 0.05), (0, 0, 0.36), 'stone', bevel=0.008, parent=g)
    box(sc, (w * 0.62, d * 0.55, 0.33), (0, 0, 0.165), 'dark', bevel=0.004, parent=g)
    cyl(sc, 0.14, 0.06, (w * 0.22, 0.05, 0.415), 'ceramic', r2=0.09, parent=g)
    for i, t in enumerate((0.03, 0.025, 0.02)):
        box(sc, (0.3 - i * 0.03, 0.22 - i * 0.02, t), (-w * 0.2, -0.05, 0.385 + sum((0.03, 0.025, 0.02)[:i]) + t / 2), 'linen' if i % 2 else 'dark', bevel=0.002, parent=g)


def sideTable(sc, p, g):
    cyl(sc, 0.26, 0.035, (0, 0, 0.53), 'stone', parent=g)
    cyl(sc, 0.04, 0.5, (0, 0, 0.26), 'metal', parent=g)
    cyl(sc, 0.17, 0.02, (0, 0, 0.01), 'metal', parent=g)


def chair(sc, g, at=(0, 0, 0), rot=0.0):
    c = bpy.data.objects.new('chair', None)
    sc.coll('suite').objects.link(c)
    c.parent = g
    c.location = at
    c.rotation_euler.z = rot
    soft(sc, (0.48, 0.46, 0.06), (0, -0.01, 0.47), 'fabric', give=0.025, parent=c)
    back = box(sc, (0.46, 0.035, 0.42), (0, 0.21, 0.73), 'wood', bevel=0.01, parent=c)
    back.rotation_euler.x = math.radians(-8)
    for x, y in ((-0.2, -0.19), (0.2, -0.19), (-0.2, 0.19), (0.2, 0.19)):
        box(sc, (0.035, 0.035, 0.45), (x, y, 0.225), 'wood', bevel=0.006, parent=c)
    return c


def dining(sc, p, g):
    w = p.get('w', 2.6)
    d = p.get('d', 1.0)
    box(sc, (w, d, 0.05), (0, 0, 0.745), 'wood', bevel=0.012, parent=g)
    for s in (-1, 1):
        box(sc, (0.07, d * 0.72, 0.72), (s * (w / 2 - 0.3), 0, 0.36), 'wood', bevel=0.008, parent=g)
    n = max(2, int(w // 0.75))
    for i in range(n):
        x = -w / 2 + (w / n) * (i + 0.5)
        chair(sc, g, (x, -(d / 2 + 0.2), 0), math.pi)
        chair(sc, g, (x, d / 2 + 0.2, 0), 0.0)
    vase = cyl(sc, 0.09, 0.28, (0.2, 0, 0.91), 'ceramic', r2=0.06, parent=g)
    vase.name = 'vase'
    for i in range(6):
        stem = cyl(sc, 0.004, 0.62, (0.2 + math.sin(i * 2.4) * 0.05, math.cos(i * 2.4) * 0.05, 1.28), 'dark', verts=6, bevel=0, parent=g)
        stem.rotation_euler = (math.sin(i * 1.7) * 0.35, math.cos(i * 2.1) * 0.3, 0)


def bed(sc, p, g):
    w = p.get('w', 2.0)
    l = p.get('d', 2.15)
    box(sc, (w + 0.12, l, 0.24), (0, 0, 0.16), 'dark', bevel=0.01, parent=g)
    soft(sc, (w - 0.02, l - 0.08, 0.24), (0, -0.02, 0.4), 'linen', give=0.06, parent=g)
    soft(sc, (w + 0.06, l * 0.62, 0.07), (0, -l * 0.17, 0.545), 'linen', give=0.03, parent=g)
    soft(sc, (w + 0.1, l * 0.3, 0.06), (0, -l * 0.3, 0.57), 'fabric', give=0.03, parent=g)
    soft(sc, (w + 0.1, 0.05, 0.3), (0, -l / 2 - 0.02, 0.43), 'fabric', give=0.02, parent=g)
    for s in (-1, 1):
        pl = soft(sc, (w * 0.42, 0.34, 0.16), (s * w * 0.23, l / 2 - 0.3, 0.64), 'linen', give=0.07, parent=g)
        pl.rotation_euler.x = math.radians(-28)
        pl = soft(sc, (w * 0.38, 0.28, 0.13), (s * w * 0.21, l / 2 - 0.52, 0.62), 'linen', give=0.06, parent=g)
        pl.rotation_euler.x = math.radians(-14)
    panels = 5
    pw = (w + 0.9) / panels
    for i in range(panels):
        soft(sc, (pw - 0.012, 0.07, 1.1), (-(w + 0.9) / 2 + pw * (i + 0.5), l / 2 + 0.04, 0.6), 'fabric', give=0.025, parent=g)
    for s in (-1, 1):
        x = s * (w / 2 + 0.42)
        box(sc, (0.5, 0.42, 0.44), (x, l / 2 - 0.25, 0.22), 'wood', bevel=0.008, parent=g)
        lamp(sc, g, (x, l / 2 - 0.25, 0.44), lit=p.get('light') and s > 0)


def lamp(sc, g, at, lit=False):
    x, y, z = at
    cyl(sc, 0.07, 0.3, (x, y, z + 0.15), 'ceramic', r2=0.09, parent=g)
    shade = cyl(sc, 0.16, 0.24, (x, y, z + 0.42), 'shade', r2=0.18, parent=g)
    shade.name = 'shade'
    point(sc, (x, y, z + 0.42), energy=25 if lit else 12, parent=g)


def desk(sc, p, g):
    w = p.get('w', 1.4)
    box(sc, (w, 0.6, 0.035), (0, 0, 0.745), 'wood', bevel=0.008, parent=g)
    for s in (-1, 1):
        box(sc, (0.035, 0.56, 0.73), (s * (w / 2 - 0.035), 0, 0.365), 'wood', bevel=0.006, parent=g)
    chair(sc, g, (0.1, -0.55, 0), math.radians(190))
    lamp(sc, g, (-w / 2 + 0.2, 0.12, 0.76), lit=p.get('light'))
    box(sc, (0.3, 0.22, 0.02), (0.15, 0.02, 0.775), 'linen', bevel=0.002, parent=g)


def tub(sc, p, g):
    w = p.get('w', 1.7)
    d = p.get('d', 0.85)
    deep = p.get('variant') == 'ofuro'
    h = 0.68 if deep else 0.56
    shell = 'basalt' if deep else 'ceramic'
    outer = box(sc, (w, d, h), (0, 0, h / 2), shell, bevel=0.03 if deep else 0.12, segments=5, parent=g)
    cutter = box(sc, (w - 0.14, d - 0.14, h), (0, 0, h / 2 + 0.1), shell, bevel=0, parent=g)
    cut = outer.modifiers.new('hollow', 'BOOLEAN')
    cut.object = cutter
    cut.operation = 'DIFFERENCE'
    outer.modifiers.move(len(outer.modifiers) - 1, 0)
    cutter.hide_render = True
    cutter.hide_viewport = True
    water = box(sc, (w - 0.15, d - 0.15, 0.01), (0, 0, h - 0.1), 'water', bevel=0, parent=g)
    water.name = 'water'
    cyl(sc, 0.014, 0.95, (w / 2 + 0.2, 0, 0.475), 'metal', parent=g)
    spout = box(sc, (0.25, 0.025, 0.025), (w / 2 + 0.09, 0, 0.94), 'metal', bevel=0.005, parent=g)
    spout.name = 'spout'
    soft(sc, (0.5, 0.32, 0.04), (-w / 2 - 0.35, -0.2, 0.02), 'linen', give=0.015, parent=g)


def vanity(sc, p, g):
    w = p.get('w', 2.0)
    box(sc, (w, 0.52, 0.42), (0, 0, 0.66), 'wood', bevel=0.006, parent=g)
    box(sc, (w + 0.04, 0.55, 0.04), (0, -0.01, 0.89), 'stone', bevel=0.004, parent=g)
    for s in ((-1, 1) if w > 1.3 else (0,)):
        cyl(sc, 0.21, 0.13, (s * w * 0.25, -0.03, 0.975), 'ceramic', r2=0.16, bevel=0.01, parent=g)
        cyl(sc, 0.17, 0.005, (s * w * 0.25, -0.03, 1.04), 'water', bevel=0, parent=g)
        tap = cyl(sc, 0.012, 0.28, (s * w * 0.25, 0.2, 1.03), 'metal', parent=g)
        tap.name = 'tap'
    box(sc, (w - 0.1, 0.02, 0.95), (0, 0.27, 1.62), 'mirror', bevel=0.002, parent=g)
    box(sc, (w - 0.1, 0.03, 0.02), (0, 0.255, 1.13), 'glow', bevel=0, parent=g)


def plant(sc, p, g):
    h = p.get('h', 1.4)
    cyl(sc, 0.21, 0.44, (0, 0, 0.22), 'ceramic', r2=0.16, bevel=0.01, parent=g)
    cyl(sc, 0.19, 0.01, (0, 0, 0.43), 'soil', bevel=0, parent=g)
    cyl(sc, 0.012, h * 0.75, (0, 0, 0.42 + h * 0.37), 'bark', verts=8, bevel=0, parent=g)
    me = leaf_mesh()
    n = 34
    for i in range(n):
        a = i * 2.39996
        t = i / n
        leaf = bpy.data.objects.new('leaf', me)
        sc.coll('suite').objects.link(leaf)
        leaf.parent = g
        if not me.materials:
            me.materials.append(sc.mat('leaf'))
        leaf.location = (math.cos(a) * 0.03, math.sin(a) * 0.03, 0.42 + t * (h - 0.5))
        leaf.rotation_euler = (math.radians(20 + (1 - t) * 50), 0, a)
        leaf.scale = [0.8 + t * 1.1] * 3


def ikebana(sc, p, g):
    cyl(sc, 0.11, 0.26, (0, 0, 0.13), 'basalt', r2=0.13, parent=g)
    for i in range(5):
        b = cyl(sc, 0.005, 0.8 - i * 0.1, (math.sin(i) * 0.08, 0, 0.6), 'bark', verts=6, bevel=0, parent=g)
        b.rotation_euler = (0.2 * math.cos(i * 1.3), 0.25 + i * 0.18, i * 1.3)
    for i in range(14):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.025)
        bloom = bpy.context.active_object
        link(bloom, sc.coll('suite'))
        bloom.data.materials.append(sc.mat('blossom'))
        bloom.parent = g
        bloom.location = (0.1 + math.sin(i * 1.9) * 0.2, math.sin(i * 2.7) * 0.14, 0.72 + math.cos(i * 1.3) * 0.18)


def art(sc, p, g):
    w = p.get('w', 1.2)
    h = p.get('h', 1.5)
    box(sc, (w + 0.06, 0.035, h + 0.06), (0, 0.0, 0), 'dark', bevel=0.004, parent=g)
    box(sc, (w, 0.01, h), (0, -0.02, 0), 'art', bevel=0, parent=g)


def rug(sc, p, g):
    soft(sc, (p.get('w', 2.6), p.get('d', 1.8), 0.018), (0, 0, 0.009), 'rug', give=0.006, parent=g)


def wardrobe(sc, p, g):
    w = p.get('w', 2.0)
    box(sc, (w, 0.6, 2.4), (0, 0, 1.2), 'wood', bevel=0.004, parent=g)


def bench(sc, p, g):
    w = p.get('w', 1.6)
    box(sc, (w, 0.4, 0.05), (0, 0, 0.445), 'wood', bevel=0.008, parent=g)
    box(sc, (w * 0.85, 0.3, 0.42), (0, 0, 0.21), 'stone', bevel=0.006, parent=g)


def pendant(sc, p, g):
    y = p.get('h', 2.1)
    cyl(sc, 0.003, 3 - y, (0, 0, (3 + y) / 2), 'dark', verts=6, bevel=0, parent=g)
    cyl(sc, 0.26, 0.07, (0, 0, y), 'shade', r2=0.2, parent=g)
    point(sc, (0, 0, y - 0.06), energy=60 if p.get('light') else 25, radius=0.15, parent=g)


def daybed(sc, p, g):
    w = p.get('w', 2.2)
    box(sc, (w, 1.2, 0.32), (0, 0, 0.16), 'stone', bevel=0.02, parent=g)
    soft(sc, (w - 0.08, 1.12, 0.14), (0, 0, 0.39), 'linen', give=0.06, parent=g)
    for s in (-0.3, 0.3):
        c = soft(sc, (0.5, 0.15, 0.32), (s * w, 0.45, 0.6), 'fabric', give=0.07, parent=g)
        c.rotation_euler.x = math.radians(-15)


def lounger(sc, p, g):
    box(sc, (0.7, 1.95, 0.16), (0, 0, 0.18), 'wood', bevel=0.01, parent=g)
    soft(sc, (0.66, 1.3, 0.08), (0, -0.28, 0.31), 'linen', give=0.03, parent=g)
    back = soft(sc, (0.66, 0.65, 0.08), (0, 0.62, 0.5), 'linen', give=0.03, parent=g)
    back.rotation_euler.x = math.radians(40)


def firepit(sc, p, g):
    cyl(sc, 0.7, 0.36, (0, 0, 0.18), 'stone', r2=0.66, verts=64, bevel=0.02, parent=g)
    cyl(sc, 0.52, 0.02, (0, 0, 0.37), 'basalt', bevel=0, parent=g)
    for i in range(9):
        f = cyl(sc, 0.06, 0.32 + (i % 3) * 0.1, (math.cos(i) * 0.2, math.sin(i * 1.7) * 0.2, 0.55), 'flame', r2=0.0, verts=8, bevel=0, parent=g)
        f.name = 'flame'
    point(sc, (0, 0, 0.8), energy=220, color=(1.0, 0.55, 0.25), radius=0.3, parent=g)


def pool(sc, p, g):
    # The basin itself is cut out of the deck by the suite builder; this is the water and the coping.
    w = p.get('w', 6.0)
    d = p.get('d', 3.0)
    box(sc, (w, d, 0.01), (0, 0, -0.08), 'water', bevel=0, parent=g).name = 'water'
    box(sc, (w, d, 0.02), (0, 0, -1.3), 'pooltile', bevel=0, parent=g)
    for (sx, sy, ax, ay) in ((w, 0.06, 0, d / 2), (w, 0.06, 0, -d / 2), (0.06, d, w / 2, 0), (0.06, d, -w / 2, 0)):
        box(sc, (sx, sy, 1.3), (ax, ay, -0.65), 'pooltile', bevel=0, parent=g)
    lip = 0.3
    for (sx, sy, ax, ay) in ((w + 2 * lip, lip, 0, d / 2 + lip / 2), (w + 2 * lip, lip, 0, -d / 2 - lip / 2),
                             (lip, d, w / 2 + lip / 2, 0), (lip, d, -w / 2 - lip / 2, 0)):
        box(sc, (sx, sy, 0.04), (ax, ay, 0.02), 'coping', bevel=0.006, parent=g)


def rock(sc, p, g):
    s = p.get('w', 1.5)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=s)
    r = bpy.context.active_object
    link(r, sc.coll('suite'))
    r.parent = g
    r.scale = (1.0, 0.85, 0.62)
    r.location = (0, 0, s * 0.3)
    tex = bpy.data.textures.new('rock', 'VORONOI')
    tex.noise_scale = 0.6
    dsp = r.modifiers.new('rough', 'DISPLACE')
    dsp.texture = tex
    dsp.strength = 0.25
    r.data.materials.append(sc.mat('sandstone'))
    for f in r.data.polygons:
        f.use_smooth = True


def palm(sc, p, g, coll='suite'):
    h = p.get('h', 6.0)
    curve = bpy.data.curves.new('trunk', 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = 0.14
    curve.bevel_resolution = 4
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(2)
    pts = [(0, 0, 0), (0.25, 0, h * 0.5), (0.9, 0.2, h)]
    for bp, co in zip(spline.bezier_points, pts):
        bp.co = co
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    spline.bezier_points[0].radius = 1.3
    spline.bezier_points[2].radius = 0.8
    trunk = bpy.data.objects.new('trunk', curve)
    sc.coll(coll).objects.link(trunk)
    trunk.parent = g
    curve.materials.append(sc.mat('bark'))
    me = leaf_mesh()
    if not me.materials:
        me.materials.append(sc.mat('leaf'))
    for i in range(12):
        frond = bpy.data.objects.new('frond', None)
        sc.coll(coll).objects.link(frond)
        frond.parent = g
        frond.location = (0.9, 0.2, h)
        frond.rotation_euler = (0, math.radians(40 + (i % 3) * 18), i / 12 * math.tau)
        for k in range(16):
            for side in (-1, 1):
                lf = bpy.data.objects.new('frondleaf', me)
                sc.coll(coll).objects.link(lf)
                lf.parent = frond
                lf.location = (k * 0.15, 0, -0.012 * k * k)
                lf.rotation_euler = (0, 0, side * math.radians(70) - math.pi / 2)
                lf.scale = (0.7, 1.4 * (1 - k / 22), 0.7)


def bowl(sc, p, g):
    cyl(sc, 0.16, 0.08, (0, 0, 0.04), 'ceramic', r2=0.09, bevel=0.01, parent=g)


def shelf(sc, p, g):
    w = p.get('w', 1.6)
    for z in (0.4, 0.9, 1.4, 1.9):
        box(sc, (w, 0.38, 0.035), (0, 0, z), 'wood', bevel=0.004, parent=g)
    for s in (-1, 1):
        box(sc, (0.035, 0.38, 2.0), (s * w / 2, 0, 1.0), 'wood', bevel=0.004, parent=g)
    for i in range(7):
        box(sc, (0.04 + (i % 3) * 0.015, 0.22, 0.24 + (i % 2) * 0.03), (-w / 2 + 0.2 + i * 0.065, 0, 0.55), 'linen' if i % 2 else 'dark', bevel=0.003, parent=g)
    cyl(sc, 0.1, 0.24, (w * 0.25, 0, 1.04), 'ceramic', r2=0.07, parent=g)
    cyl(sc, 0.13, 0.12, (-w * 0.2, 0, 1.48), 'basalt', r2=0.13, parent=g)


def door(sc, p, g):
    w = p.get('w', 1.0)
    box(sc, (w, 0.05, 2.38), (0, 0, 1.19), 'wood', bevel=0.004, parent=g)
    box(sc, (0.02, 0.03, 0.3), (w / 2 - 0.12, -0.05, 1.05), 'metal', bevel=0.004, parent=g)


def post(sc, p, g):
    h = p.get('h', 2.9)
    box(sc, (0.2, 0.2, h), (0, 0, h / 2), 'wood', bevel=0.01, parent=g)
    box(sc, (0.34, 0.34, 0.12), (0, 0, 0.06), 'stone', bevel=0.01, parent=g)


KINDS = {f.__name__: f for f in (sofa, armchair, lowTable, sideTable, dining, bed, desk, tub, vanity, plant, ikebana,
                                 art, rug, wardrobe, bench, pendant, daybed, lounger, firepit, pool, rock, palm, bowl,
                                 shelf, door, post)}


def furnish(sc, p, floor_z):
    x, z = p['at']
    g = empty(sc, p['kind'], plan(x, z, floor_z + p.get('y', 0.0)), p.get('rot', 0.0))
    KINDS[p['kind']](sc, p, g)
    return g
