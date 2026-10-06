"""Tiny motion-graphics engine: numpy canvas, SDF shapes, text, bloom, post."""
import math
from collections import OrderedDict

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter

import os
W = int(os.environ.get('MOTION_WIDTH', '1920'))
H = int(os.environ.get('MOTION_HEIGHT', '1080'))
FPS = 30
DUR = float(os.environ.get('MOTION_DURATION', '15'))
NFR = int(DUR * FPS)


def hexc(h):
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (1, 3, 5)], np.float32)


INK = hexc('#07070d')
PAPER = hexc('#f1ede4')
WHITE = hexc('#fbf8f2')
MAG = hexc('#ff2d78')
CYAN = hexc('#22d8ff')
LIME = hexc('#c8ff3c')
VIO = hexc('#7b4dff')
ORG = hexc('#ff8a1f')

# ------------------------------------------------------------------ fonts
import glob
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_FONT_DIRS = [os.environ.get('REEL_FONT_DIR', ''), os.path.join(_HERE, 'fonts'),
              os.path.expanduser('~/.fonts'), os.path.expanduser('~/.local/share/fonts'),
              '/usr/share/fonts', '/usr/local/share/fonts',
              os.path.expanduser('~/Library/Fonts'), '/Library/Fonts', '/System/Library/Fonts',
              'C:/Windows/Fonts']


def find_font(filename, fallbacks):
    """Search common font dirs for `filename`; else first fallback that exists; else a bare
    name Pillow may resolve itself. Put your .ttf files in ./fonts to override."""
    for d in _FONT_DIRS:
        if d and os.path.isdir(d):
            hits = glob.glob(os.path.join(d, '**', filename), recursive=True)
            if hits:
                return hits[0]
    for fb in fallbacks:
        for d in _FONT_DIRS:
            if d and os.path.isdir(d):
                hits = glob.glob(os.path.join(d, '**', fb), recursive=True)
                if hits:
                    print(f'[engine] {filename} not found, using {fb}', file=sys.stderr)
                    return hits[0]
    print(f'[engine] {filename} not found and no fallback located; trying bare name', file=sys.stderr)
    return fallbacks[-1]


_SANS_B = ['DejaVuSans-Bold.ttf', 'Arial Bold.ttf', 'arialbd.ttf']
_SANS = ['DejaVuSans.ttf', 'Arial.ttf', 'arial.ttf']
_MONO_B = ['DejaVuSansMono-Bold.ttf', 'Courier New Bold.ttf', 'courbd.ttf']
POP_B = find_font('MotionSans.ttf', _SANS_B)
POP_M = find_font('MotionSans.ttf', _SANS)
POP_R = find_font('MotionSans.ttf', _SANS)
POP_L = find_font('MotionSans.ttf', _SANS)
MONO = find_font('DejaVuSansMono-Bold.ttf', _MONO_B)

# ------------------------------------------------------------------ easing


def clamp01(x):
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def prog(t, t0, d):
    return clamp01((t - t0) / d)


def lerp(a, b, x):
    return a + (b - a) * x


def smooth(e0, e1, x):
    x = clamp01((x - e0) / (e1 - e0))
    return x * x * (3 - 2 * x)


def e_out3(x):
    return 1 - (1 - x) ** 3


def e_io3(x):
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def e_out_expo(x):
    return 1.0 if x >= 1 else 1 - 2 ** (-10 * x)


def e_out_back(x, s=1.70158):
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    x -= 1
    return 1 + (s + 1) * x ** 3 + s * x ** 2


def e_out_elastic(x):
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    c = 2 * math.pi / 3
    return 2 ** (-10 * x) * math.sin((x * 10 - 0.75) * c) + 1


def pal(u, cols):
    n = len(cols)
    u = (u % 1.0) * n
    i = int(u) % n
    f = u - int(u)
    return cols[i] * (1 - f) + cols[(i + 1) % n] * f


# ------------------------------------------------------------------ grids
_yy, _xx = np.mgrid[0:H, 0:W]
XX = _xx.astype(np.float32) + 0.5
YY = _yy.astype(np.float32) + 0.5
del _yy, _xx
LW, LH = W // 4, H // 4
LX, LY = np.meshgrid((np.arange(LW, dtype=np.float32) + 0.5) * 4,
                     (np.arange(LH, dtype=np.float32) + 0.5) * 4)
RR = np.hypot(XX - W / 2, YY - H / 2).astype(np.float32)
TH = np.arctan2(YY - H / 2, XX - W / 2).astype(np.float32)
_vr = np.hypot((XX - W / 2) / (W / 2), (YY - H / 2) / (H / 2))
_t = np.clip((_vr - 0.5) / 0.95, 0, 1)
VIGN = (_t * _t * (3 - 2 * _t)).astype(np.float32)
del _vr, _t

# ------------------------------------------------------------------ resize


def rs(a, w, h):
    out = np.empty((h, w, 3), np.float32)
    for c in range(3):
        im = Image.fromarray(np.ascontiguousarray(a[..., c]))
        out[..., c] = np.asarray(im.resize((w, h), Image.BILINEAR))
    return out


def rs1(a, w, h):
    return np.asarray(Image.fromarray(np.ascontiguousarray(a)).resize((w, h), Image.BILINEAR))


def upsample(a):
    return rs(a, W, H)


def pool(a, f):
    h, w, c = a.shape
    if h % f or w % f:
        a = np.pad(a, ((0, (-h) % f), (0, (-w) % f), (0, 0)), mode='edge')
        h, w, c = a.shape
    return a.reshape(h // f, f, w // f, f, c).mean(axis=(1, 3))


# ------------------------------------------------------------------ paint


def _paint(cv, x0, y0, x1, y1, cov, color, alpha, add):
    a = cov * alpha if alpha != 1.0 else cov
    reg = cv[y0:y1, x0:x1]
    if add:
        reg += a[..., None] * color
    else:
        reg += (color - reg) * a[..., None]


def _bb(x0, y0, x1, y1):
    return (max(0, int(math.floor(x0))), max(0, int(math.floor(y0))),
            min(W, int(math.ceil(x1))), min(H, int(math.ceil(y1))))


def draw_circle(cv, cx, cy, r, color, alpha=1.0, add=False, ring=None):
    m = r + (ring or 0) / 2 + 2
    x0, y0, x1, y1 = _bb(cx - m, cy - m, cx + m, cy + m)
    if x1 <= x0 or y1 <= y0 or alpha <= 0.002:
        return
    X = XX[y0:y1, x0:x1] - cx
    Y = YY[y0:y1, x0:x1] - cy
    d = np.sqrt(X * X + Y * Y) - r
    if ring:
        d = np.abs(d) - ring / 2
    _paint(cv, x0, y0, x1, y1, np.clip(0.5 - d, 0, 1), color, alpha, add)


def draw_rbox(cv, cx, cy, hw, hh, rad, color, alpha=1.0, rot=0.0, add=False, stroke=None):
    m = math.hypot(hw, hh) + 3 + (stroke or 0)
    x0, y0, x1, y1 = _bb(cx - m, cy - m, cx + m, cy + m)
    if x1 <= x0 or y1 <= y0 or alpha <= 0.002 or hw <= 0 or hh <= 0:
        return
    X = XX[y0:y1, x0:x1] - cx
    Y = YY[y0:y1, x0:x1] - cy
    if rot:
        c, s = math.cos(rot), math.sin(rot)
        X, Y = c * X + s * Y, -s * X + c * Y
    rad = min(rad, hw, hh)
    qx = np.abs(X) - hw + rad
    qy = np.abs(Y) - hh + rad
    d = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - rad
    if stroke:
        d = np.abs(d) - stroke / 2
    _paint(cv, x0, y0, x1, y1, np.clip(0.5 - d, 0, 1), color, alpha, add)


def draw_line(cv, xa, ya, xb, yb, w, color, alpha=1.0, add=False):
    m = w / 2 + 2
    x0, y0, x1, y1 = _bb(min(xa, xb) - m, min(ya, yb) - m, max(xa, xb) + m, max(ya, yb) + m)
    if x1 <= x0 or y1 <= y0 or alpha <= 0.002:
        return
    px = XX[y0:y1, x0:x1] - xa
    py = YY[y0:y1, x0:x1] - ya
    bx, by = xb - xa, yb - ya
    den = bx * bx + by * by
    h = np.clip((px * bx + py * by) / den, 0, 1) if den > 1e-6 else 0
    d = np.hypot(px - bx * h, py - by * h) - w / 2
    _paint(cv, x0, y0, x1, y1, np.clip(0.5 - d, 0, 1), color, alpha, add)


def draw_ellipse_ring(cv, cx, cy, a, b, rot, w, color, alpha=1.0, add=True):
    m = max(a, b) + w + 3
    x0, y0, x1, y1 = _bb(cx - m, cy - m, cx + m, cy + m)
    if x1 <= x0 or y1 <= y0 or alpha <= 0.002:
        return
    X = XX[y0:y1, x0:x1] - cx
    Y = YY[y0:y1, x0:x1] - cy
    c, s = math.cos(rot), math.sin(rot)
    X, Y = c * X + s * Y, -s * X + c * Y
    e = np.hypot(X / a, Y / b)
    g = np.sqrt((X / (a * a)) ** 2 + (Y / (b * b)) ** 2) / np.maximum(e, 1e-4) + 1e-6
    d = np.abs(e - 1) / g - w / 2
    _paint(cv, x0, y0, x1, y1, np.clip(0.5 - d, 0, 1), color, alpha, add)


def fill_rect(cv, x0, y0, x1, y1, color, alpha=1.0, add=False):
    x0, y0, x1, y1 = max(0, int(x0)), max(0, int(y0)), min(W, int(x1)), min(H, int(y1))
    if x1 <= x0 or y1 <= y0:
        return
    reg = cv[y0:y1, x0:x1]
    if add:
        reg += np.asarray(color, np.float32) * alpha
    else:
        reg += (np.asarray(color, np.float32) - reg) * alpha


def splat(cv, xs, ys, cols, gain=1.0):
    """Additive soft 3x3 dots at float positions. cols: (N,3)."""
    ix = np.round(xs).astype(np.int32)
    iy = np.round(ys).astype(np.int32)
    k = ((0.35, 0.7, 0.35), (0.7, 1.0, 0.7), (0.35, 0.7, 0.35))
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            xx, yy = ix + ox, iy + oy
            ok = (xx >= 0) & (xx < W) & (yy >= 0) & (yy < H)
            if ok.any():
                np.add.at(cv, (yy[ok], xx[ok]), cols[ok] * (k[oy + 1][ox + 1] * gain))


def lights(cv, specs):
    """specs: (cx, cy, sigma, color, amount) added as soft radial glows."""
    acc = np.zeros((LH, LW, 3), np.float32)
    for cx, cy, sg, col, amt in specs:
        g = np.exp(-((LX - cx) ** 2 + (LY - cy) ** 2) / (2 * sg * sg)) * amt
        acc += g[..., None] * np.asarray(col, np.float32)
    cv += upsample(acc)


# ------------------------------------------------------------------ text
_FC = {}
_MC = OrderedDict()
_MC_BYTES = [0]


def get_font(path, size):
    k = (path, size)
    f = _FC.get(k)
    if f is None:
        f = ImageFont.truetype(path, size)
        _FC[k] = f
    return f


def layout(text, path, size, tracking=0.0):
    f = get_font(path, int(size))
    xs, x = [], 0.0
    for ch in text:
        xs.append(x)
        x += f.getlength(ch) + tracking
    return xs, x - tracking


def text_mask(text, path, size, tracking=0.0, outline=0):
    key = (text, path, int(size), round(float(tracking), 2), int(outline))
    hit = _MC.get(key)
    if hit is not None:
        _MC.move_to_end(key)
        return hit
    f = get_font(path, int(size))
    asc, desc = f.getmetrics()
    xs, tw = layout(text, path, size, tracking)
    pad = int(outline) + 3
    w = int(math.ceil(tw)) + 2 * pad + 2
    h = asc + desc + 2 * pad

    def render(stroke):
        img = Image.new('L', (w, h), 0)
        d = ImageDraw.Draw(img)
        for ch, x in zip(text, xs):
            if ch != ' ':
                d.text((pad + x, pad), ch, font=f, fill=255, stroke_width=stroke, stroke_fill=255)
        return np.asarray(img)

    if outline:
        a = render(int(outline)).astype(np.int16)
        b = render(0).astype(np.int16)
        m = np.clip(a - b, 0, 255).astype(np.uint8)
    else:
        m = render(0)
    entry = (m, pad, asc, tw)
    _MC[key] = entry
    _MC_BYTES[0] += m.nbytes
    while _MC_BYTES[0] > 140e6 and len(_MC) > 1:
        _, old = _MC.popitem(last=False)
        _MC_BYTES[0] -= old[0].nbytes
    return entry


def blit_mask(cv, m, x, y, color, alpha, add, clip=None, mod=None):
    h, w = m.shape
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if clip is not None:
        x0, y0 = max(x0, int(clip[0])), max(y0, int(clip[1]))
        x1, y1 = min(x1, int(clip[2])), min(y1, int(clip[3]))
    if x1 <= x0 or y1 <= y0:
        return
    a = m[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32) * (alpha / 255.0)
    if mod is not None:
        a = a * mod(XX[y0:y1, x0:x1], YY[y0:y1, x0:x1])
    reg = cv[y0:y1, x0:x1]
    color = np.asarray(color, np.float32)
    if add:
        reg += a[..., None] * color
    else:
        reg += (color - reg) * a[..., None]


def draw_text(cv, text, path, size, x, y, color, ax='m', ay='m', tracking=0.0, alpha=1.0,
              add=False, clip=None, outline=0, dx=0.0, dy=0.0, mod=None):
    size = int(round(size))
    if size < 4 or alpha <= 0.002:
        return
    m, pad, asc, tw = text_mask(text, path, size, tracking, outline)
    left = x - (0 if ax == 'l' else tw / 2 if ax == 'm' else tw)
    base = y if ay == 'b' else (y + 0.35 * size if ay == 'm' else y + 0.70 * size)
    X0 = int(round(left + dx)) - pad
    Y0 = int(round(base + dy)) - asc - pad
    blit_mask(cv, m, X0, Y0, color, alpha, add, clip, mod)


def text_w(text, path, size, tracking=0.0):
    return layout(text, path, size, tracking)[1]


# ------------------------------------------------------------------ post


def bloom(cv, thr, k):
    if k <= 0:
        return
    s = (cv[0::4, 0::4] + cv[2::4, 2::4] + cv[1::4, 3::4] + cv[3::4, 1::4]) * 0.25
    b = np.maximum(s - thr, 0)
    g1 = gaussian_filter(b, (1.5, 1.5, 0))
    b2 = pool(b, 2)
    g2 = gaussian_filter(b2, (3, 3, 0))
    b3 = pool(b2, 3)
    g3 = gaussian_filter(b3, (2.2, 2.2, 0))
    tot = g1 * 0.55 + rs(g2, LW, LH) * 0.6 + rs(g3, LW, LH) * 0.9
    cv += upsample(tot) * k


def chroma(cv, amt):
    if amt < 0.3:
        return
    i = int(amt)
    f = amt - i
    r, b = cv[..., 0], cv[..., 2]
    r2 = (1 - f) * np.roll(r, i, 1) + f * np.roll(r, i + 1, 1)
    b2 = (1 - f) * np.roll(b, -i, 1) + f * np.roll(b, -i - 1, 1)
    cv[..., 0] = r2
    cv[..., 2] = b2


def glitch(cv, seed, amt):
    if amt < 0.05:
        return
    rs_ = np.random.RandomState(seed)
    for _ in range(8):
        y0 = rs_.randint(0, H - 80)
        h = rs_.randint(8, 80)
        dx = int(rs_.choice([-1, 1]) * rs_.randint(40, 260) * amt)
        cv[y0:y0 + h] = np.roll(cv[y0:y0 + h], dx, axis=1)


def grain(cv, amt, fi):
    g = np.random.default_rng(fi * 13 + 5)
    n = g.standard_normal((H, W), dtype=np.float32)
    cv += (n * amt)[..., None]


def to_u8(cv):
    return (np.clip(cv, 0, 1) * 255.0 + 0.5).astype(np.uint8)
