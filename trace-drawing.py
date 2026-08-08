"""
Build a self-drawing SVG from the raster drawing.

Two layers:
  artwork -- potrace outlines of every ink shape. This is what you actually
             see, so fidelity to the original is exact.
  pen     -- centerlines from the ink's skeleton, cut into chunks whose stroke
             width matches the local thickness of the artwork. Animating these
             inside a <mask> uncovers the artwork exactly like a pen laying it
             down, and because each chunk is never wider than the shape it sits
             in, the pen can't spill onto a neighbouring line.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage.morphology import skeletonize
from scipy.ndimage import convolve
import potrace

import argparse

p = argparse.ArgumentParser(
    description='Trace a line drawing into a self-drawing SVG for sketch-draw.js.')
p.add_argument('input', help='source image (png/jpg) of a black-on-white drawing')
p.add_argument('-o', '--output', default='drawing.svg')
p.add_argument('--ink', type=int, default=150,
               help='luminance below this counts as ink (0-255, default 150)')
p.add_argument('--simplify', type=float, default=0.8,
               help='centerline simplification in px (default 0.8)')
p.add_argument('--row-band', type=float, default=40,
               help='strokes starting within this many px are drawn as one row '
                    '(default 40; larger = looser top-to-bottom order)')
p.add_argument('--width-ratio', type=float, default=1.5,
               help='split a stroke when local thickness changes by this factor')
args = p.parse_args()

SRC = args.input
OUT = args.output
INK = args.ink
RDP_TOL = args.simplify
ROW_BAND = args.row_band
WIDTH_RATIO = args.width_ratio

MIN_CHUNK = 7        # px, so we don't shatter into hundreds of stubs
WIDTH_PAD = 1.0      # flat slack, px, to cover antialiased edges
WIDTH_GROW = 0.07    # extra slack proportional to width, for big filled shapes
SMOOTH = 1.0

NB8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def f1(v):
    s = f'{v:.1f}'
    return s[:-2] if s.endswith('.0') else s


# ------------------------------------------------------------------ geometry

def rdp(pts, tol):
    pts = np.asarray(pts, float)
    if len(pts) < 3:
        return pts
    keep = np.zeros(len(pts), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, b = pts[i], pts[j]
        seg = b - a
        L = float(np.hypot(seg[0], seg[1]))
        rel = pts[i + 1:j] - a
        if L < 1e-9:
            d = np.hypot(rel[:, 0], rel[:, 1])
        else:
            d = np.abs(seg[0] * rel[:, 1] - seg[1] * rel[:, 0]) / L
        k = int(np.argmax(d))
        if d[k] > tol:
            k += i + 1
            keep[k] = True
            stack += [(i, k), (k, j)]
    return pts[keep]


def seg_len(pts):
    if len(pts) < 2:
        return 0.0
    d = np.diff(pts, axis=0)
    return float(np.hypot(d[:, 0], d[:, 1]).sum())


def to_bezier(pts):
    n = len(pts)
    if n == 1:
        # A dot. Give it a hair of length so every renderer draws the round cap.
        x, y = pts[0]
        return f'M{f1(x)} {f1(y)} L{f1(x + 0.2)} {f1(y)}'
    if n == 2:
        return (f'M{f1(pts[0][0])} {f1(pts[0][1])} '
                f'L{f1(pts[1][0])} {f1(pts[1][1])}')

    def at(i):
        return pts[min(max(i, 0), n - 1)]

    d = [f'M{f1(pts[0][0])} {f1(pts[0][1])}']
    for i in range(n - 1):
        p0, p1, p2, p3 = at(i - 1), at(i), at(i + 1), at(i + 2)
        c1 = p1 + (p2 - p0) / 6.0 * SMOOTH
        c2 = p2 - (p3 - p1) / 6.0 * SMOOTH
        d.append(f'C{f1(c1[0])} {f1(c1[1])} {f1(c2[0])} {f1(c2[1])} {f1(p2[0])} {f1(p2[1])}')
    return ' '.join(d)


# ------------------------------------------------------- skeleton extraction

def skeleton_polylines(sk):
    pixels = set(map(tuple, np.argwhere(sk)))
    nbrs = {p: [(p[0] + dy, p[1] + dx) for dy, dx in NB8
                if (p[0] + dy, p[1] + dx) in pixels] for p in pixels}
    nodes = {p for p, n in nbrs.items() if len(n) != 2}
    used, polys = set(), []

    def step(a, b):
        return frozenset((a, b))

    for start in sorted(nodes):
        if not nbrs[start]:
            polys.append([start])          # isolated dot, e.g. an eye
            continue
        for first in nbrs[start]:
            if step(start, first) in used:
                continue
            used.add(step(start, first))
            path, prev, cur = [start], start, first
            while True:
                path.append(cur)
                if cur in nodes:
                    break
                nxt = [q for q in nbrs[cur] if q != prev]
                if not nxt:
                    break
                used.add(step(cur, nxt[0]))
                prev, cur = cur, nxt[0]
            polys.append(path)

    seen = {p for poly in polys for p in poly}
    for start in sorted(pixels - seen):
        if start in seen:
            continue
        path, prev, cur = [start], start, nbrs[start][0]
        seen.add(start)
        while cur != start:
            path.append(cur)
            seen.add(cur)
            nxt = [q for q in nbrs[cur] if q != prev]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
        path.append(start)
        polys.append(path)
    return polys


def chunk_by_width(pts, widths):
    """Cut a centerline where its thickness changes, so one stroke width per
    chunk stays honest. Chunks share endpoints, so there are no seams."""
    if len(pts) == 1:
        return [(pts, float(widths[0]))]
    out, start = [], 0
    lo = hi = widths[0]
    for i in range(1, len(pts)):
        w = widths[i]
        nlo, nhi = min(lo, w), max(hi, w)
        if nhi / max(nlo, 0.5) > WIDTH_RATIO and seg_len(pts[start:i + 1]) >= MIN_CHUNK:
            out.append((pts[start:i + 1], hi))
            start = i
            lo = hi = w
        else:
            lo, hi = nlo, nhi
    out.append((pts[start:], hi))
    return out


# ------------------------------------------------------------------- artwork

def contour_d(curve):
    segs = curve.segments
    s0 = segs[-1].end_point
    d = [f'M{f1(s0.x)} {f1(s0.y)}']
    for s in segs:
        if s.is_corner:
            d.append(f'L{f1(s.c.x)} {f1(s.c.y)} L{f1(s.end_point.x)} {f1(s.end_point.y)}')
        else:
            d.append(f'C{f1(s.c1.x)} {f1(s.c1.y)} {f1(s.c2.x)} {f1(s.c2.y)} '
                     f'{f1(s.end_point.x)} {f1(s.end_point.y)}')
    d.append('Z')
    return ' '.join(d)


# ------------------------------------------------------------------ pipeline

img = Image.open(SRC).convert('L')
W, H = img.size
ink = np.asarray(img) < INK
dist = ndi.distance_transform_edt(ink)
print(f'{W}x{H}, ink {ink.mean()*100:.1f}%')

# potracer inverts its input, so hand it the complement to trace the ink.
curves = potrace.Bitmap(~ink).trace(turdsize=2, alphamax=1.0, opttolerance=0.2).curves
art_d = ' '.join(contour_d(c) for c in curves)
print(f'artwork: {len(curves)} contours')

sk = skeletonize(ink)

# Degree map: a skeleton pixel with one neighbour is a free end, and free ends
# stop short of a shape's tip, so those are the ones worth extending.
K = np.ones((3, 3), np.uint8); K[1, 1] = 0
degree = convolve(sk.astype(np.uint8), K, mode='constant') * sk

polys = skeleton_polylines(sk)
print(f'skeleton: {len(polys)} centerlines')

pen = []
lines = []           # one entry per centerline, holding its chunks in order
for poly in polys:
    arr = np.array(poly)
    ys, xs = arr[:, 0], arr[:, 1]
    pts = np.column_stack([xs, ys]).astype(float)          # SVG order (x, y)
    widths = dist[ys, xs] * 2.0

    if len(pts) > 2:
        # Draw each line from its top-left end, the way a right hand moves.
        if (pts[0][1], pts[0][0]) > (pts[-1][1], pts[-1][0]):
            pts, widths = pts[::-1], widths[::-1]

    # Push free ends out past the tip of the shape so the round cap covers it.
    if len(pts) > 2:
        for end in (0, -1):
            yx = (int(round(pts[end][1])), int(round(pts[end][0])))
            if degree[yx] != 1:
                continue
            near = pts[min(6, len(pts) - 1)] if end == 0 else pts[-min(7, len(pts))]
            v = pts[end] - near
            n = float(np.hypot(v[0], v[1]))
            if n < 1e-6:
                continue
            pts[end] = pts[end] + v / n * (widths[end] * 0.5 + 1.0)

    chunks = []
    for cpts, cw in chunk_by_width(pts, widths):
        simple = rdp(cpts, RDP_TOL) if len(cpts) > 2 else cpts
        L = seg_len(simple)
        if len(simple) > 1 and L < 1.5:
            continue
        chunks.append(dict(
            d=to_bezier(simple),
            w=round(float(cw) * (1 + WIDTH_GROW) + WIDTH_PAD, 1),
            length=round(L, 1),
            sx=round(float(simple[0][0]), 1), sy=round(float(simple[0][1]), 1),
            ex=round(float(simple[-1][0]), 1), ey=round(float(simple[-1][1]), 1),
            cont=len(chunks) > 0,          # continues the previous chunk
        ))
    if chunks:
        lines.append(dict(chunks=chunks,
                          y0=float(pts[:, 1].min()), x0=float(pts[:, 0].min())))

# Order whole lines top to bottom, left to right within a band. A line's own
# chunks always stay consecutive, so it reads as one continuous stroke.
for line in lines:
    line['band'] = round(line['y0'] / ROW_BAND)
    line['start'] = (line['chunks'][0]['sx'], line['chunks'][0]['sy'])
    line['end'] = (line['chunks'][-1]['ex'], line['chunks'][-1]['ey'])

# Within a band, visit whichever line starts nearest to where the pen just
# stopped. Keeps the top-to-bottom reading while cutting wasted travel.
ordered, here = [], (0.0, 0.0)
for band in sorted({l['band'] for l in lines}):
    pool = [l for l in lines if l['band'] == band]
    while pool:
        nxt = min(pool, key=lambda l: (l['start'][0] - here[0]) ** 2
                                      + (l['start'][1] - here[1]) ** 2)
        pool.remove(nxt)
        ordered.append(nxt)
        here = nxt['end']
lines = ordered

for line in lines:
    pen.extend(line['chunks'])

total = sum(p['length'] for p in pen)
hops, prev = 0.0, None
for p in pen:
    if prev is not None and not p['cont']:
        hops += float(np.hypot(p['sx'] - prev[0], p['sy'] - prev[1]))
    prev = (p['ex'], p['ey'])
lifts = sum(1 for p in pen if not p['cont'])
print(f'pen: {len(pen)} chunks in {len(lines)} lines, {total:.0f}px drawn, '
      f'{lifts} pen lifts covering {hops:.0f}px of air, '
      f'widths {min(p["w"] for p in pen):.1f}-{max(p["w"] for p in pen):.1f}')

parts = [
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
    f'preserveAspectRatio="xMidYMid meet" data-sketch-draw="">',
    '<defs>',
    f'<mask id="sd-pen" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}">',
    '<g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">',
]
for p in pen:
    parts.append(
        f'<path class="sd-pen" stroke-width="{p["w"]}" pathLength="1" '
        f'stroke-dasharray="1" stroke-dashoffset="1" '
        f'data-len="{max(p["length"], 0.3)}"'
        + (' data-cont="1"' if p['cont'] else
           f' data-sx="{p["sx"]}" data-sy="{p["sy"]}"')
        + f' data-ex="{p["ex"]}" data-ey="{p["ey"]}" d="{p["d"]}"/>')
parts += [
    '</g></mask></defs>',
    f'<path class="sd-art" mask="url(#sd-pen)" fill="currentColor" '
    f'fill-rule="evenodd" d="{art_d}"/>',
    '</svg>',
]
svg = '\n'.join(parts)
open(OUT, 'w').write(svg)
print(f'wrote {OUT} ({len(svg)/1024:.0f} KB)')

print(f'\nDrop it in a page and animate with:\n'
      f'  <script src="sketch-draw.js"></script>\n'
      f'and either paste the SVG inline with data-sketch-draw on the <svg>,\n'
      f'or point an <img data-sketch-draw src="{OUT}"> at it.')
