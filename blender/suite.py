"""Builds one suite from its plan: floors, walls with their openings, glazing,
shoji, ceilings or pitched roofs, furniture, and the light portals Cycles
needs to sample a room lit mostly through glass."""

import math

import bpy
from mathutils import Vector

import kit
import materials as M
from kit import box, plan

THICK = 0.16


def palette(suite):
    fin = suite['finishes']

    def make(role):
        r = fin.get(role)
        if r:
            paint = r.get('paint')
            base = r['base']
            tile = r.get('tile', 1.6)
            arg = r.get('arg')
            rough = r.get('rough', 0.7)
            if paint == 'planks':
                return M.boards(role, base, width=tile / (arg or 6), length=tile * 1.1, rough=rough)
            if paint == 'grain':
                return M.grain(role, base, rough=rough)
            if paint == 'tiles':
                return M.tiles(role, base, size=tile / (arg or 2), rough=rough)
            if paint == 'stone':
                return M.tiles(role, base, size=0.9, rough=rough, veins=0.15)
            if paint == 'speckle':
                return M.speckle(role, base, rough=rough)
            if paint == 'plaster':
                return M.plaster(role, base, rough=max(rough, 0.8))
            if paint == 'weave':
                return M.fabric(role, base)
            if paint == 'washi':
                return M.washi(role, base)
            return M.plain(role, base, rough=rough, metal=r.get('metal', 0.0))
        defaults = {
            'metal': lambda: M.plain('metal', '#5e5245', rough=0.32, metal=0.95),
            'mullion': lambda: M.plain('mullion', '#2c2722', rough=0.4, metal=0.8),
            'mirror': lambda: M.plain('mirror', '#dfe3e3', rough=0.02, metal=1.0),
            'glow': lambda: M.glow('glow', '#ffe8cc', 7.0),
            'shade': lambda: M.shade_paper('shade', '#e2d3bb'),
            'border': lambda: M.fabric('border', '#161616', sheen=0.3),
            'lacquer': lambda: M.plain('lacquer', '#121111', rough=0.12, coat=1.0),
            'sweets': lambda: M.plain('sweets', '#9b1f1c', rough=0.5),
            'pot': lambda: M.speckle('pot', '#6b5f53', rough=0.9),
            'chrome': lambda: M.plain('chrome', '#d8d8d8', rough=0.08, metal=1.0),
            'panel': lambda: M.plain('panel', '#2e2f31', rough=0.3, metal=0.4),
            'leaf': lambda: M.leaf('leaf', '#35552f'),
            'blossom': lambda: M.plain('blossom', '#f1d4d0', rough=0.6),
            'bark': lambda: M.speckle('bark', '#6d5d4b', rough=0.9),
            'soil': lambda: M.plain('soil', '#2d2620', rough=1.0),
            'ceramic': lambda: M.plain('ceramic', '#ebe5db', rough=0.22, coat=0.5),
            'glass': lambda: M.glass(),
            'water': lambda: M.water('water', fin.get('water', {}).get('base', '#5f8f92')),
            'paper': lambda: M.shade_paper('paper'),
            'art': lambda: ink(fin.get('accent', {}).get('base', '#8a5a3c')),
            'slab': lambda: M.plaster('slab', '#d6d0c6'),
            'ceiling': lambda: M.plaster('ceiling', '#efe9df'),
        }
        if role in defaults:
            return defaults[role]()
        return M.plain(role, '#cccccc')

    return make


def ink(accent):
    """Brushed ink on paper. Aman hangs calligraphy rather than colour fields."""
    t = M.Tree('art')
    mp = t.coords(1.0)
    n = t.add('ShaderNodeTexNoise', -400, 0)
    t.set(n, Scale=2.2, Detail=12.0, Roughness=0.65, Distortion=1.4)
    t.link(mp, 'Vector', n, 'Vector')
    ramp = t.add('ShaderNodeValToRGB', 0, 0)
    ramp.color_ramp.interpolation = 'EASE'
    els = ramp.color_ramp.elements
    els[0].position = 0.36
    els[0].color = M.rgb('#1f1c1a')
    els[1].position = 0.42
    els[1].color = M.rgb('#efe8dc')
    mid = els.new(0.39)
    mid.color = M.rgb(accent)
    t.link(n, 'Fac', ramp, 'Fac')
    t.link(ramp, 'Color', t.bsdf, 'Base Color')
    t.set(t.bsdf, Roughness=0.9)
    return t.mat


def runs(length, gaps):
    out = []
    t = 0.0
    for g in sorted(gaps or [], key=lambda g: g['at']):
        start = max(t, g['at'] - g['w'] / 2)
        if start > t:
            out.append((t, start, None))
        end = min(length, g['at'] + g['w'] / 2)
        out.append((start, end, g))
        t = end
    if t < length:
        out.append((t, length, None))
    return out


def bounds(rooms):
    xs = [r['rect'][0] for r in rooms] + [r['rect'][2] for r in rooms]
    zs = [r['rect'][1] for r in rooms] + [r['rect'][3] for r in rooms]
    return min(xs), min(zs), max(xs), max(zs)


def segment(sc, a, b, t0, t1, z0, z1, thick, mat, coll='suite', bevel=0.004):
    """A straight piece of wall between two distances along a→b, from z0 to z1."""
    ax, az = a
    bx, bz = b
    length = math.hypot(bx - ax, bz - az)
    dx, dz = (bx - ax) / length, (bz - az) / length
    mx, mz = ax + dx * (t0 + t1) / 2, az + dz * (t0 + t1) / 2
    obj = box(sc, (t1 - t0, thick, z1 - z0), plan(mx, mz, (z0 + z1) / 2), mat, bevel=bevel, coll=coll)
    obj.rotation_euler.z = math.atan2(-dz, dx)
    return obj


def build(sc, suite, z0=0.0):
    H = suite['height']
    x0, zz0, x1, zz1 = bounds(suite['rooms'])
    cx, cz = (x0 + x1) / 2, (zz0 + zz1) / 2

    # in a tower the slab is the building's, flush with the facade
    box(sc, (x1 - x0, zz1 - zz0, 0.5), plan(cx, cz, z0 - 0.31), 'slab', bevel=0.01)

    for room in suite['rooms']:
        rx0, rz0, rx1, rz1 = room['rect']
        box(sc, (rx1 - rx0, rz1 - rz0, 0.06), plan((rx0 + rx1) / 2, (rz0 + rz1) / 2, z0 - 0.03), room['floor'], bevel=0.0)
        if room.get('ceiling') is False:
            continue
        downlight(sc, room, z0 + suite['height'])
        role = room.get('ceiling') or 'ceiling'
        w, d = rx1 - rx0, rz1 - rz0
        if room.get('cove'):
            cove(sc, room, role, z0 + H)
        else:
            box(sc, (w, d, 0.1), plan((rx0 + rx1) / 2, (rz0 + rz1) / 2, z0 + H + 0.05), role, bevel=0, coll='ceiling')

    indoors = [r['rect'] for r in suite['rooms'] if r.get('ceiling') is not False]
    for wall in suite['walls']:
        build_wall(sc, wall, z0, H, indoors)

    for p in suite['pieces']:
        kit.furnish(sc, p, z0)

    return {'centre': plan(cx, cz, z0), 'span': max(x1 - x0, zz1 - zz0), 'floor': z0}


def downlight(sc, room, ceiling):
    """A soft warm wash from above, the way rooms are lit for photography."""
    rx0, rz0, rx1, rz1 = room['rect']
    w, d = rx1 - rx0, rz1 - rz0
    light = bpy.data.lights.new('wash', 'AREA')
    light.shape = 'RECTANGLE'
    light.size, light.size_y = w * 0.6, d * 0.6
    light.energy = 9 * w * d
    light.color = (1.0, 0.92, 0.82)
    obj = bpy.data.objects.new('wash', light)
    sc.coll('lights').objects.link(obj)
    obj.location = plan((rx0 + rx1) / 2, (rz0 + rz1) / 2, ceiling - 0.02)


def cove(sc, room, role, top):
    """A lowered band round the room with a strip light on its inner edge,
    washing the raised middle of the ceiling: how the Aman rooms are lit."""
    rx0, rz0, rx1, rz1 = room['rect']
    w, d = rx1 - rx0, rz1 - rz0
    band = 0.55
    lift = 0.22
    mx, mz = (rx0 + rx1) / 2, (rz0 + rz1) / 2
    box(sc, (w, d, 0.06), plan(mx, mz, top + lift + 0.03), role, bevel=0, coll='ceiling')
    for (sx, sz, ax, az) in ((w, band, mx, rz0 + band / 2), (w, band, mx, rz1 - band / 2),
                             (band, d - 2 * band, rx0 + band / 2, mz), (band, d - 2 * band, rx1 - band / 2, mz)):
        box(sc, (sx, sz, 0.08), plan(ax, az, top + 0.04), role, bevel=0, coll='ceiling')
    for (sx, sz, ax, az) in ((w - 2 * band, 0.03, mx, rz0 + band), (w - 2 * band, 0.03, mx, rz1 - band),
                             (0.03, d - 2 * band, rx0 + band, mz), (0.03, d - 2 * band, rx1 - band, mz)):
        box(sc, (sx, sz, 0.015), plan(ax, az, top + 0.09), 'glow', bevel=0, coll='ceiling')


def build_wall(sc, wall, z0, H, indoors):
    a, b = wall['a'], wall['b']
    length = math.hypot(b[0] - a[0], b[1] - a[1])
    kind = wall.get('kind', 'solid')
    role = wall.get('finish', 'wall')
    parts = runs(length, wall.get('gaps'))

    if kind == 'low':
        for t0, t1, gap in parts:
            if not gap:
                segment(sc, a, b, t0, t1, z0, z0 + 0.95, THICK + 0.1, role)
                segment(sc, a, b, t0 - 0.02, t1 + 0.02, z0 + 0.95, z0 + 1.0, THICK + 0.16, 'coping')
        return

    if kind in ('glass', 'paper'):
        frame = 'mullion' if kind == 'glass' else 'wood'
        bay = 1.5 if kind == 'glass' else 0.95
        for t0, t1, gap in parts:
            if gap:
                continue
            span = t1 - t0
            n = max(1, round(span / bay))
            for i in range(n + 1):
                t = t0 + span * i / n
                half = 0.06 if kind == 'glass' else 0.035
                segment(sc, a, b, t - half, t + half, z0, z0 + H, 0.22 if kind == 'glass' else 0.06, frame, bevel=0.003)
            for i in range(n):
                p0 = t0 + span * i / n + 0.03
                p1 = t0 + span * (i + 1) / n - 0.03
                if kind == 'glass':
                    segment(sc, a, b, p0, p1, z0 + 0.04, z0 + H - 0.06, 0.014, 'glass', coll='glass', bevel=0)
                else:
                    segment(sc, a, b, p0, p1, z0, z0 + H, 0.01, 'paper', bevel=0)
                    z = 0.34
                    while z < H - 0.1:
                        segment(sc, a, b, p0, p1, z0 + z - 0.01, z0 + z + 0.01, 0.035, 'wood', bevel=0.002)
                        z += 0.34
            if kind == 'glass':
                portal(sc, a, b, t0, t1, z0, H, indoors)
        segment(sc, a, b, 0, length, z0 + H - 0.08, z0 + H, 0.14, frame)
        segment(sc, a, b, 0, length, z0, z0 + 0.04, 0.14, frame)
        return

    for t0, t1, gap in parts:
        if not gap:
            e0 = -THICK / 2 if t0 == 0 else t0
            e1 = length + THICK / 2 if t1 == length else t1
            segment(sc, a, b, e0, e1, z0, z0 + H, THICK, role)
            if role == 'washi':
                # an oak rail at door height and an oak skirting, as in the photographs
                segment(sc, a, b, e0, e1, z0 + 2.38, z0 + 2.5, THICK + 0.03, 'oak', bevel=0.003)
                segment(sc, a, b, e0, e1, z0, z0 + 0.07, THICK + 0.024, 'oak', bevel=0.003)
            else:
                # the shadow gap at the foot of the wall that finished rooms have
                segment(sc, a, b, e0, e1, z0, z0 + 0.05, THICK + 0.012, 'dark', bevel=0)
            continue
        top = gap.get('top', 2.4)
        sill = gap.get('sill', 0)
        if top < H:
            segment(sc, a, b, t0, t1, z0 + top, z0 + H, THICK, role)
        if sill > 0:
            segment(sc, a, b, t0, t1, z0, z0 + sill, THICK, role)
            segment(sc, a, b, t0 + 0.03, t1 - 0.03, z0 + sill + 0.02, z0 + top - 0.02, 0.014, 'glass', coll='glass', bevel=0)


def portal(sc, a, b, t0, t1, z0, H, indoors):
    ax, az = a
    bx, bz = b
    length = math.hypot(bx - ax, bz - az)
    dx, dz = (bx - ax) / length, (bz - az) / length
    mx, mz = ax + dx * (t0 + t1) / 2, az + dz * (t0 + t1) / 2
    light = bpy.data.lights.new('portal', 'AREA')
    light.shape = 'RECTANGLE'
    light.size = t1 - t0
    light.size_y = H
    try:
        light.cycles.is_portal = True
    except AttributeError:
        return
    obj = bpy.data.objects.new('portal', light)
    sc.coll('portals').objects.link(obj)
    # a portal only works facing into the room, so find which side of the glass is indoors
    nx, nz = -dz, dx
    px, pz = mx + nx * 0.3, mz + nz * 0.3
    if not any(r[0] < px < r[2] and r[1] < pz < r[3] for r in indoors):
        nx, nz = -nx, -nz
    obj.location = plan(mx, mz, z0 + H / 2)
    obj.rotation_euler = Vector((nx, -nz, 0)).to_track_quat('-Z', 'Z').to_euler()
