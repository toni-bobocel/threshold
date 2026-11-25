"""Procedural PBR materials, built from node trees so the scenes need no image files.

Planks and stone tiles come from the Brick texture, the usual archviz trick:
it gives per-board colour variation and real joints, and bump does the rest.
"""

import bpy


def rgb(hex_):
    h = hex_.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, 1.0)


def shade(hex_, k):
    r, g, b, _ = rgb(hex_)
    return (r * k, g * k, b * k, 1.0)


class Tree:
    def __init__(self, name):
        self.mat = bpy.data.materials.new(name)
        self.mat.use_nodes = True
        self.nodes = self.mat.node_tree.nodes
        self.links = self.mat.node_tree.links
        self.nodes.clear()
        self.out = self.add('ShaderNodeOutputMaterial', 900, 0)
        self.bsdf = self.add('ShaderNodeBsdfPrincipled', 600, 0)
        self.link(self.bsdf, 'BSDF', self.out, 'Surface')

    def add(self, kind, x=0, y=0, **props):
        n = self.nodes.new(kind)
        n.location = (x, y)
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def link(self, a, out, b, inp):
        self.links.new(a.outputs[out], b.inputs[inp])

    def set(self, node, **inputs):
        for k, v in inputs.items():
            node.inputs[k].default_value = v

    def coords(self, scale=1.0):
        tc = self.add('ShaderNodeTexCoord', -900, 0)
        mp = self.add('ShaderNodeMapping', -700, 0)
        mp.inputs['Scale'].default_value = (scale, scale, scale)
        self.link(tc, 'Object', mp, 'Vector')
        return mp

    def bump(self, height_node, out='Fac', strength=0.2, distance=0.02):
        b = self.add('ShaderNodeBump', 400, -300)
        self.set(b, Strength=strength, Distance=distance)
        self.link(height_node, out, b, 'Height')
        self.link(b, 'Normal', self.bsdf, 'Normal')
        return b


def plain(name, color, rough=0.5, metal=0.0, coat=0.0):
    t = Tree(name)
    t.set(t.bsdf, **{'Base Color': rgb(color), 'Roughness': rough, 'Metallic': metal, 'Coat Weight': coat})
    return t.mat


def boards(name, color, width=0.18, length=1.4, rough=0.45, coat=0.15):
    """Floorboards: brick texture for the boards, wave texture for the grain."""
    t = Tree(name)
    mp = t.coords()
    brick = t.add('ShaderNodeTexBrick', -400, 200, offset=0.37, offset_frequency=1, squash=1, squash_frequency=1)
    t.set(brick, Color1=shade(color, 0.86), Color2=shade(color, 1.12), Mortar=shade(color, 0.45),
          Scale=1.0, **{'Mortar Size': 0.0025, 'Mortar Smooth': 0.2, 'Bias': 0.0, 'Brick Width': length, 'Row Height': width})
    t.link(mp, 'Vector', brick, 'Vector')
    stretch = t.add('ShaderNodeMapping', -550, -150)
    stretch.inputs['Scale'].default_value = (0.06, 1.0, 1.0)
    t.link(mp, 'Vector', stretch, 'Vector')
    wave = t.add('ShaderNodeTexNoise', -400, -150)
    t.set(wave, Scale=40.0, Detail=10.0, Roughness=0.55, Distortion=0.5)
    t.link(stretch, 'Vector', wave, 'Vector')
    mix = t.add('ShaderNodeMix', 200, 100, data_type='RGBA', blend_type='MULTIPLY')
    t.set(mix, Factor=0.35)
    t.link(brick, 'Color', mix, 'A')
    ramp = t.add('ShaderNodeValToRGB', 0, -150)
    ramp.color_ramp.elements[0].color = (0.86, 0.86, 0.86, 1)
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    t.link(wave, 'Fac', ramp, 'Fac')
    t.links.new(ramp.outputs['Color'], mix.inputs[7])
    t.links.new(mix.outputs[2], t.bsdf.inputs['Base Color'])
    t.set(t.bsdf, Roughness=rough, **{'Coat Weight': coat, 'Coat Roughness': 0.2})
    t.bump(brick, 'Fac', strength=0.25, distance=0.003)
    return t.mat


def grain(name, color, rough=0.45):
    """Solid wood for furniture: grain only, no joints."""
    t = Tree(name)
    mp = t.coords()
    # fine, straight grain: camphor and oak are quarter-sawn here, no cathedral figure
    stretch = t.add('ShaderNodeMapping', -550, 0)
    stretch.inputs['Scale'].default_value = (1.0, 1.0, 0.08)
    t.link(mp, 'Vector', stretch, 'Vector')
    wave = t.add('ShaderNodeTexNoise', -400, 0)
    t.set(wave, Scale=38.0, Detail=10.0, Roughness=0.55, Distortion=0.6)
    t.link(stretch, 'Vector', wave, 'Vector')
    ramp = t.add('ShaderNodeValToRGB', 0, 0)
    ramp.color_ramp.elements[0].color = shade(color, 0.9)
    ramp.color_ramp.elements[1].color = shade(color, 1.06)
    t.link(wave, 'Fac', ramp, 'Fac')
    t.link(ramp, 'Color', t.bsdf, 'Base Color')
    t.set(t.bsdf, Roughness=rough, **{'Coat Weight': 0.25, 'Coat Roughness': 0.25})
    t.bump(wave, 'Fac', strength=0.05, distance=0.002)
    return t.mat


def tiles(name, color, size=0.6, rough=0.4, veins=0.0):
    """Large-format stone, laid in running bond, with a soft cloud of tone and optional veining."""
    t = Tree(name)
    mp = t.coords()
    brick = t.add('ShaderNodeTexBrick', -400, 200, offset=0.5, offset_frequency=2)
    t.set(brick, Color1=shade(color, 0.95), Color2=shade(color, 1.05), Mortar=shade(color, 0.6),
          Scale=1.0, **{'Mortar Size': 0.002, 'Brick Width': size * 2, 'Row Height': size})
    t.link(mp, 'Vector', brick, 'Vector')
    cloud = t.add('ShaderNodeTexNoise', -400, -200)
    t.set(cloud, Scale=3.0, Detail=8.0, Roughness=0.6)
    t.link(mp, 'Vector', cloud, 'Vector')
    mix = t.add('ShaderNodeMix', 200, 100, data_type='RGBA', blend_type='OVERLAY')
    t.set(mix, Factor=0.25 + veins)
    t.link(brick, 'Color', mix, 'A')
    t.links.new(cloud.outputs['Color'], mix.inputs[7])
    t.links.new(mix.outputs[2], t.bsdf.inputs['Base Color'])
    t.set(t.bsdf, Roughness=rough)
    t.bump(brick, 'Fac', strength=0.3, distance=0.002)
    return t.mat


def plaster(name, color, rough=0.85):
    t = Tree(name)
    mp = t.coords(1.0)
    n = t.add('ShaderNodeTexNoise', -400, 0)
    t.set(n, Scale=40.0, Detail=10.0, Roughness=0.7)
    t.link(mp, 'Vector', n, 'Vector')
    big = t.add('ShaderNodeTexNoise', -400, 250)
    t.set(big, Scale=1.5, Detail=4.0)
    t.link(mp, 'Vector', big, 'Vector')
    mix = t.add('ShaderNodeMix', 200, 100, data_type='RGBA', blend_type='OVERLAY')
    t.set(mix, Factor=0.12, A=rgb(color))
    t.links.new(big.outputs['Color'], mix.inputs[7])
    t.links.new(mix.outputs[2], t.bsdf.inputs['Base Color'])
    t.set(t.bsdf, Roughness=rough)
    t.bump(n, 'Fac', strength=0.06, distance=0.01)
    return t.mat


def fabric(name, color, sheen=0.6):
    t = Tree(name)
    mp = t.coords(1.0)
    n = t.add('ShaderNodeTexNoise', -400, 0)
    t.set(n, Scale=220.0, Detail=4.0)
    t.link(mp, 'Vector', n, 'Vector')
    t.set(t.bsdf, **{'Base Color': rgb(color), 'Roughness': 0.95, 'Sheen Weight': sheen, 'Sheen Roughness': 0.4})
    t.bump(n, 'Fac', strength=0.35, distance=0.003)
    return t.mat


def washi(name, color):
    """Washi on timber: tall paper panels with fine joints and a fibre you see up close."""
    t = Tree(name)
    mp = t.coords()
    sep = t.add('ShaderNodeSeparateXYZ', -700, 200)
    t.link(mp, 'Vector', sep, 'Vector')
    # walls run along x or y, so let both feed the brick's horizontal axis
    along = t.add('ShaderNodeMath', -550, 250, operation='ADD')
    t.link(sep, 'X', along, 0)
    t.link(sep, 'Y', along, 1)
    uv = t.add('ShaderNodeCombineXYZ', -400, 250)
    t.link(along, 'Value', uv, 'X')
    t.link(sep, 'Z', uv, 'Y')
    brick = t.add('ShaderNodeTexBrick', -200, 200, offset=0.0)
    t.set(brick, Color1=rgb(color), Color2=shade(color, 0.97), Mortar=shade(color, 0.82), Scale=1.0,
          **{'Mortar Size': 0.0018, 'Brick Width': 0.9, 'Row Height': 2.4})
    t.link(uv, 'Vector', brick, 'Vector')
    fibre = t.add('ShaderNodeTexNoise', -200, -150)
    t.set(fibre, Scale=180.0, Detail=12.0, Roughness=0.75, Distortion=2.0)
    t.link(mp, 'Vector', fibre, 'Vector')
    mix = t.add('ShaderNodeMix', 150, 100, data_type='RGBA', blend_type='OVERLAY')
    t.set(mix, Factor=0.06)
    t.link(brick, 'Color', mix, 'A')
    t.links.new(fibre.outputs['Color'], mix.inputs[7])
    t.links.new(mix.outputs[2], t.bsdf.inputs['Base Color'])
    t.set(t.bsdf, Roughness=0.92, **{'Sheen Weight': 0.3})
    t.bump(fibre, 'Fac', strength=0.08, distance=0.002)
    return t.mat


def speckle(name, color, rough=0.6):
    t = Tree(name)
    mp = t.coords()
    v = t.add('ShaderNodeTexVoronoi', -400, 0)
    t.set(v, Scale=180.0)
    t.link(mp, 'Vector', v, 'Vector')
    mix = t.add('ShaderNodeMix', 200, 100, data_type='RGBA', blend_type='MULTIPLY')
    t.set(mix, Factor=0.25, A=rgb(color))
    t.links.new(v.outputs['Color'], mix.inputs[7])
    t.links.new(mix.outputs[2], t.bsdf.inputs['Base Color'])
    t.set(t.bsdf, Roughness=rough)
    t.bump(v, 'Distance', strength=0.2, distance=0.003)
    return t.mat


def strata(name, low, high):
    """Sandstone: colour bands by height, broken up by noise, as Utah rock is."""
    t = Tree(name)
    geo = t.add('ShaderNodeNewGeometry', -900, 0)
    wave = t.add('ShaderNodeTexWave', -300, 0, wave_type='BANDS', bands_direction='Z')
    t.set(wave, Scale=0.012, Distortion=14.0, Detail=6.0, **{'Detail Scale': 3.0})
    t.link(geo, 'Position', wave, 'Vector')
    dust = t.add('ShaderNodeTexNoise', -300, -250)
    t.set(dust, Scale=0.05, Detail=8.0)
    t.link(geo, 'Position', dust, 'Vector')
    t.bump(dust, 'Fac', strength=0.4, distance=2.0)
    ramp = t.add('ShaderNodeValToRGB', 0, 0)
    ramp.color_ramp.elements[0].color = rgb(low)
    ramp.color_ramp.elements[1].color = rgb(high)
    t.link(wave, 'Fac', ramp, 'Fac')
    t.link(ramp, 'Color', t.bsdf, 'Base Color')
    t.set(t.bsdf, Roughness=0.95)
    return t.mat


def glass(name='glass', tint=(0.92, 0.95, 0.95, 1)):
    t = Tree(name)
    t.set(t.bsdf, **{'Base Color': tint, 'Roughness': 0.0, 'Transmission Weight': 1.0, 'IOR': 1.5})
    return t.mat


def water(name, color):
    t = Tree(name)
    mp = t.coords()
    n = t.add('ShaderNodeTexNoise', -400, -100)
    t.set(n, Scale=6.0, Detail=3.0)
    t.link(mp, 'Vector', n, 'Vector')
    t.set(t.bsdf, **{'Base Color': rgb(color), 'Roughness': 0.02, 'Transmission Weight': 0.9, 'IOR': 1.33})
    t.bump(n, 'Fac', strength=0.15, distance=0.02)
    return t.mat


def glow(name, color='#ffd7a3', strength=6.0):
    t = Tree(name)
    em = t.add('ShaderNodeEmission', 600, 200)
    t.set(em, Color=rgb(color), Strength=strength)
    t.link(em, 'Emission', t.out, 'Surface')
    return t.mat


def shade_paper(name, color='#f1eadc'):
    """Washi: lets warm light through, which is the point of it."""
    t = Tree(name)
    t.set(t.bsdf, **{'Base Color': rgb(color), 'Roughness': 0.9, 'Subsurface Weight': 0.0})
    tr = t.add('ShaderNodeBsdfTranslucent', 400, 250)
    t.set(tr, Color=rgb(color))
    mix = t.add('ShaderNodeMixShader', 750, 100)
    t.set(mix, Fac=0.4)
    t.link(t.bsdf, 'BSDF', mix, 1)
    t.link(tr, 'BSDF', mix, 2)
    t.link(mix, 'Shader', t.out, 'Surface')
    return t.mat


def leaf(name, color='#3c5a35'):
    t = Tree(name)
    t.set(t.bsdf, **{'Base Color': rgb(color), 'Roughness': 0.45, 'Subsurface Weight': 0.0})
    tr = t.add('ShaderNodeBsdfTranslucent', 400, 250)
    t.set(tr, Color=shade(color, 1.6))
    mix = t.add('ShaderNodeMixShader', 750, 100)
    t.set(mix, Fac=0.25)
    t.link(t.bsdf, 'BSDF', mix, 1)
    t.link(tr, 'BSDF', mix, 2)
    t.link(mix, 'Shader', t.out, 'Surface')
    return t.mat


def windows(name, wall='#3d4250', lit=0.25, warm='#ffcf96', floor=4.2, bay=1.6):
    """Office facades at dusk: a grid of panes, a share of them lit.

    The brick texture gives every brick its own random shade between Color1
    and Color2, which makes a cheap per-window coin toss.
    """
    t = Tree(name)
    mp = t.coords()
    sep = t.add('ShaderNodeSeparateXYZ', -650, 200)
    t.link(mp, 'Vector', sep, 'Vector')
    # x and y share the horizontal axis so every face of a block gets windows
    addxy = t.add('ShaderNodeMath', -500, 300, operation='ADD')
    t.link(sep, 'X', addxy, 0)
    t.link(sep, 'Y', addxy, 1)
    info = t.add('ShaderNodeObjectInfo', -650, -100)
    shift = t.add('ShaderNodeMath', -500, 100, operation='MULTIPLY_ADD')
    shift.inputs[1].default_value = 37.0
    t.link(info, 'Random', shift, 0)
    t.link(sep, 'Z', shift, 2)
    comb = t.add('ShaderNodeCombineXYZ', -350, 300)
    t.link(addxy, 'Value', comb, 'X')
    t.link(shift, 'Value', comb, 'Y')
    brick = t.add('ShaderNodeTexBrick', -150, 200, offset=0.0)
    t.set(brick, Color1=(0, 0, 0, 1), Color2=(1, 1, 1, 1), Mortar=(0, 0, 0, 1), Scale=1.0, Bias=0.0,
          **{'Mortar Size': 0.1, 'Mortar Smooth': 0.0, 'Brick Width': bay, 'Row Height': floor})
    t.link(comb, 'Vector', brick, 'Vector')
    luma = t.add('ShaderNodeRGBToBW', 50, 200)
    t.link(brick, 'Color', luma, 'Color')
    on = t.add('ShaderNodeMath', 200, 200, operation='LESS_THAN')
    on.inputs[1].default_value = lit
    t.link(luma, 'Val', on, 0)
    pane = t.add('ShaderNodeMath', 200, 0, operation='SUBTRACT')
    pane.inputs[0].default_value = 1.0
    t.link(brick, 'Fac', pane, 1)
    glow_ = t.add('ShaderNodeMath', 350, 100, operation='MULTIPLY')
    t.link(on, 'Value', glow_, 0)
    t.link(pane, 'Value', glow_, 1)
    em = t.add('ShaderNodeMath', 480, 100, operation='MULTIPLY')
    em.inputs[1].default_value = 3.0
    t.link(glow_, 'Value', em, 0)
    t.set(t.bsdf, **{'Base Color': rgb(wall), 'Roughness': 0.3, 'Metallic': 0.15, 'Emission Color': rgb(warm)})
    t.link(em, 'Value', t.bsdf, 'Emission Strength')
    return t.mat


def clay():
    return plain('clay', '#efede9', rough=0.85)
