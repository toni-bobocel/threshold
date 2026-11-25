"""Renders one suite as an image sequence.

    blender -b --factory-startup --python blender/render.py -- tokyo colour
    blender -b --factory-startup --python blender/render.py -- tokyo clay

Options after the pass: --every N renders one frame in N (for a quick look),
--only fly|model|descend|walk|leave, --scale 50 for half resolution,
--frames 10,40 for exact frames.
"""

import argparse
import json
import math
import os
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import kit  # noqa: E402
import materials as M  # noqa: E402
import outside  # noqa: E402
import shots  # noqa: E402
import suite as S  # noqa: E402


def options():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('suite')
    p.add_argument('pass_', choices=('colour', 'clay'))
    p.add_argument('--every', type=int, default=1)
    p.add_argument('--only')
    p.add_argument('--frames')
    p.add_argument('--scale', type=int, default=100)
    p.add_argument('--samples', type=int, default=96)
    return p.parse_args(argv)


def gpu():
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == 'OPTIX'
    bpy.context.scene.cycles.device = 'GPU'


def settings(opt):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    gpu()
    c = scene.cycles
    c.samples = opt.samples
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.012
    c.use_denoising = True
    c.denoiser = 'OPENIMAGEDENOISE'
    c.denoising_use_gpu = True
    c.max_bounces = 10
    c.diffuse_bounces = 5
    c.glossy_bounces = 4
    c.transmission_bounces = 10
    c.transparent_max_bounces = 10
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.blur_glossy = 0.8
    c.sample_clamp_indirect = 6.0
    scene.render.use_persistent_data = True
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 810
    scene.render.resolution_percentage = opt.scale
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'AgX'
    for look in ('AgX - Medium High Contrast', 'Medium High Contrast'):
        try:
            scene.view_settings.look = look
            break
        except TypeError:
            continue
    scene.view_settings.exposure = 0.55


def floor_height(suite):
    if suite['view'] == 'city':
        return (suite['gauge']['to'] - 1) * outside.FLOOR
    if suite['view'] == 'sea':
        return outside.PLATEAU
    return 0.0


def main():
    opt = options()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with open(os.path.join(HERE, 'suites.json'), encoding='utf-8') as f:
        suite = json.load(f)[opt.suite]

    sc = kit.Scene(S.palette(suite))
    z0 = floor_height(suite)
    fly = None
    if opt.pass_ == 'colour':
        fly = outside.BUILDERS[suite['view']](sc, suite)
    info = S.build(sc, suite, z0)
    outside.sun_and_sky(suite)
    settings(opt)

    if opt.pass_ == 'clay':
        bpy.context.view_layer.material_override = M.clay()
        for name in ('glass', 'lights'):
            if name in sc.collections:
                sc.collections[name].hide_render = True

    cam_data = bpy.data.cameras.new('camera')
    cam_data.sensor_fit = 'VERTICAL'
    cam_data.clip_start = 0.05
    cam_data.clip_end = 60000
    cam = bpy.data.objects.new('camera', cam_data)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    frames, titled = shots.plan(suite, info, fly)
    if opt.pass_ == 'clay':
        frames = [f for f in frames if f['seg'] == 'model']

    out = os.path.join(HERE, 'out', opt.suite, opt.pass_)
    os.makedirs(out, exist_ok=True)

    if opt.pass_ == 'colour':
        meta = {
            'segments': {},
            'titled': titled,
            'frames': [],
        }
        for i, f in enumerate(frames):
            seg = meta['segments'].setdefault(f['seg'], [i, 0])
            seg[1] += 1
            p, l = f['pos'], f['look']
            # back to plan coordinates for the minimap: x east, z south
            meta['frames'].append([round(p.x, 2), round(-p.y, 2), round(math.degrees(math.atan2(-(l.y - p.y), l.x - p.x)), 1), round(f['inside'], 3)])
        with open(os.path.join(out, 'meta.json'), 'w', encoding='utf-8') as fh:
            json.dump(meta, fh, separators=(',', ':'))

    wanted = set(range(0, len(frames), opt.every))
    if opt.frames:
        wanted = {int(x) for x in opt.frames.split(',')}
    if opt.only:
        wanted = {i for i in wanted if frames[i]['seg'] == opt.only}

    ceiling_top = z0 + suite['height'] - 0.05
    colls = sc.collections
    started = time.time()
    done = 0
    for i, f in enumerate(frames):
        if i not in wanted:
            continue
        path = os.path.join(out, f'{i:04d}.png')
        if os.path.exists(path) and opt.every == 1 and not opt.frames:
            continue
        cam.location = f['pos']
        cam.rotation_euler = (f['look'] - f['pos']).to_track_quat('-Z', 'Y').to_euler()
        cam_data.angle_y = math.radians(f['fov'])
        below = f['pos'].z < ceiling_top
        if 'ceiling' in colls:
            colls['ceiling'].hide_render = not below
        world_visible = opt.pass_ == 'colour' and (f['seg'] == 'fly' or below)
        if 'outside' in colls:
            colls['outside'].hide_render = not world_visible
        bpy.context.scene.render.film_transparent = not world_visible
        bpy.context.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        done += 1
        print(f'frame {i} {f["seg"]} {(time.time() - started) / done:.1f}s/frame', flush=True)


main()
