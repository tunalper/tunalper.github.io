"""Builds assets/fonts/sc-pixel.woff2 from tools/glyphs.json.

Every lit pixel becomes part of a rectangle contour; one pixel = 125 units,
1 em = 8 pixels (7 above the baseline, 1 below). Monospace advance = 6 px.
Run after `node tools/glyphs.mjs`:  python3 tools/build-font.py
"""
import json
import os

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PX = 125
UPM = 1000
ASC = 7 * PX
DESC = -1 * PX
ADV = 6 * PX


def rects(rows):
    """Greedy merge of lit pixels into rectangles (x, y, w, h) in pixel space."""
    grid = [[bool(v & (1 << (5 - x))) for x in range(6)] for v in rows]
    used = [[False] * 6 for _ in range(8)]
    out = []
    for y in range(8):
        x = 0
        while x < 6:
            if grid[y][x] and not used[y][x]:
                w = 1
                while x + w < 6 and grid[y][x + w] and not used[y][x + w]:
                    w += 1
                h = 1
                while y + h < 8 and all(grid[y + h][x + i] and not used[y + h][x + i] for i in range(w)):
                    h += 1
                for yy in range(y, y + h):
                    for xx in range(x, x + w):
                        used[yy][xx] = True
                out.append((x, y, w, h))
                x += w
            else:
                x += 1
    return out


def draw_glyph(rows):
    pen = TTGlyphPen(None)
    for (x, y, w, h) in rects(rows):
        # pixel row 0 is the top of the ascent; convert to font units (y up)
        x0 = x * PX
        x1 = (x + w) * PX
        top = (7 - y) * PX
        bot = (7 - y - h) * PX
        # clockwise outer contour (TrueType fill rule)
        pen.moveTo((x0, bot))
        pen.lineTo((x0, top))
        pen.lineTo((x1, top))
        pen.lineTo((x1, bot))
        pen.closePath()
    return pen.glyph()


def main():
    data = json.load(open(os.path.join(ROOT, 'tools', 'glyphs.json'), encoding='utf-8'))
    glyphs = data['small']['glyphs']

    order = ['.notdef']
    cmap = {}
    shapes = {}
    notdef = TTGlyphPen(None)
    notdef.moveTo((PX, 0)); notdef.lineTo((PX, ASC)); notdef.lineTo((5 * PX, ASC)); notdef.lineTo((5 * PX, 0)); notdef.closePath()
    notdef.moveTo((2 * PX, PX)); notdef.lineTo((4 * PX, PX)); notdef.lineTo((4 * PX, ASC - PX)); notdef.lineTo((2 * PX, ASC - PX)); notdef.closePath()
    shapes['.notdef'] = notdef.glyph()

    for ch, rows in glyphs.items():
        cp = ord(ch)
        name = 'uni%04X' % cp if cp <= 0xFFFF else 'u%05X' % cp
        order.append(name)
        cmap[cp] = name
        shapes[name] = draw_glyph(rows)
    # non-breaking space shares the space glyph
    cmap[0xA0] = cmap[0x20]

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(shapes)
    fb.setupHorizontalMetrics({n: (ADV, 0) for n in order})
    fb.setupHorizontalHeader(ascent=ASC, descent=DESC, lineGap=0)
    fb.setupNameTable({
        'familyName': 'SC Pixel',
        'styleName': 'Regular',
        'uniqueFontIdentifier': 'SCPixel-Regular',
        'fullName': 'SC Pixel Regular',
        'psName': 'SCPixel-Regular',
        'version': 'Version 1.000',
    })
    fb.setupOS2(
        version=4,
        sTypoAscender=ASC, sTypoDescender=DESC, sTypoLineGap=0,
        usWinAscent=ASC, usWinDescent=-DESC,
        fsSelection=0x40 | 0x80,  # REGULAR | USE_TYPO_METRICS
        achVendID='SCPX', usWeightClass=400, xAvgCharWidth=ADV,
    )
    fb.setupPost(isFixedPitch=1)
    fb.setupHead(unitsPerEm=UPM, created=3849948144, modified=3849948144)

    out_dir = os.path.join(ROOT, 'assets', 'fonts')
    os.makedirs(out_dir, exist_ok=True)
    fb.font.flavor = 'woff2'
    path = os.path.join(out_dir, 'sc-pixel.woff2')
    fb.save(path)
    print('wrote', path, os.path.getsize(path), 'bytes,', len(order), 'glyphs')


if __name__ == '__main__':
    main()
