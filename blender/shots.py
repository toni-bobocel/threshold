"""Where the camera is on every frame. The web page only maps scroll onto frame
numbers, so easing is baked in here, and so is what the minimap needs."""

import math

from mathutils import Vector

FLY = 96
MODEL = 72
DESCEND = 54
LEAVE = 54
PER_LEG = 34


def smooth(t):
    return t * t * (3 - 2 * t)


def catmull(points, t):
    """Centripetal Catmull-Rom, the same curve three.js draws, so the walk
    checked by walk.test.ts is the walk rendered here."""
    n = len(points)
    p = (n - 1) * t
    i = int(math.floor(p))
    w = p - i
    if i >= n - 1:
        i, w = n - 2, 1.0
    p0 = points[i - 1] if i > 0 else points[0] * 2 - points[1]
    p1, p2 = points[i], points[i + 1]
    p3 = points[i + 2] if i + 2 < n else points[n - 1] * 2 - points[n - 2]
    d0 = (p0 - p1).length_squared ** 0.25
    d1 = (p1 - p2).length_squared ** 0.25
    d2 = (p2 - p3).length_squared ** 0.25
    if d1 < 1e-4:
        d1 = 1.0
    if d0 < 1e-4:
        d0 = d1
    if d2 < 1e-4:
        d2 = d1
    t1 = ((p1 - p0) / d0 - (p2 - p0) / (d0 + d1) + (p2 - p1) / d1) * d1
    t2 = ((p2 - p1) / d1 - (p3 - p1) / (d1 + d2) + (p3 - p2) / d2) * d1
    c2 = -3 * p1 + 3 * p2 - 2 * t1 - t2
    c3 = 2 * p1 - 2 * p2 + t1 + t2
    return p1 + t1 * w + c2 * w * w + c3 * w * w * w


def legs(stops):
    out = []
    for a, b in zip(stops, stops[1:]):
        out.append(0.35 + math.hypot(b['pos'][0] - a['pos'][0], b['pos'][2] - a['pos'][2]) * 0.17)
    return out


def plan(suite, info, fly=None):
    z0 = info['floor']

    def v(p):
        return Vector((p[0], -p[2], p[1] + z0))

    stops = suite['stops']
    pos = [v(s['pos']) for s in stops]
    look = [v(s['look']) for s in stops]
    centre = info['centre']
    R = info['span'] * 1.18

    def iso(spin):
        a = suite['iso'] - 0.3 + spin * 0.55
        # three.js orbit: x + sin(a)·R, z + cos(a)·R; z is -y here
        p = Vector((centre.x + math.sin(a) * R, centre.y - math.cos(a) * R, z0 + R * 0.92))
        return p, Vector((centre.x, centre.y, z0 - 0.4))

    frames = []

    def add(seg, p, l, fov, inside=0.0):
        frames.append({'seg': seg, 'pos': p.copy(), 'look': l.copy(), 'fov': fov, 'inside': inside})

    if fly:
        for i in range(FLY):
            u = smooth(i / (FLY - 1))
            add('fly', catmull(fly['pos'], u), catmull(fly['look'], u), 38 - 6 * u)

    for i in range(MODEL):
        p, l = iso(i / (MODEL - 1))
        add('model', p, l, 30)

    def walk_at(u):
        return catmull(pos, u), catmull(look, u)

    for i in range(DESCEND):
        k = smooth((i + 1) / DESCEND)
        ip, il = iso(1 + 0.4 * (i + 1) / DESCEND)
        wp, wl = walk_at(0)
        add('descend', ip.lerp(wp, k), il.lerp(wl, k), 30 + 32 * k, k)

    n = len(stops)
    arrivals = [len(frames) - 1]
    for li, length in enumerate(legs(stops)):
        count = max(10, round(length * PER_LEG))
        stop_at_start = li == 0 or bool(stops[li].get('title'))
        stop_at_end = bool(stops[li + 1].get('title'))
        for j in range(1, count + 1):
            t = j / count
            # slow down for a stop that has something to say; walk straight through a turn
            if stop_at_start and stop_at_end:
                e = smooth(t)
            elif stop_at_start:
                e = 1 - math.cos(t * math.pi / 2)
            elif stop_at_end:
                e = math.sin(t * math.pi / 2)
            else:
                e = t
            u = (li + e) / (n - 1)
            wp, wl = walk_at(u)
            add('walk', wp, wl, 62, 1.0)
        arrivals.append(len(frames) - 1)

    for i in range(LEAVE):
        k = 1 - smooth((i + 1) / LEAVE)
        ip, il = iso(1.4 + 0.6 * (i + 1) / LEAVE)
        wp, wl = walk_at(1)
        add('leave', ip.lerp(wp, k), il.lerp(wl, k), 30 + 32 * k, k)

    titled = [arrivals[i] for i, s in enumerate(stops) if s.get('title')]
    return frames, titled
