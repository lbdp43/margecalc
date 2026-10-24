"""Generate the MargeBar Pro app identity assets (D1 « Émeraude Signature »).

Mark (spec §2): squircle, emerald gradient, white double ring
(outer: 1.5 px at 5 px inset, inner: 1 px at 8 px inset on a 40 px mark)
and a Plus Jakarta Sans 800 « M ». Parametrised by D = outer ring diameter.

Usage (needs Pillow; run from anywhere):
  python3 scripts/generate-icons.py [out_dir] [plus-jakarta-sans font dir]
Defaults: mobile/assets and node_modules/@expo-google-fonts/plus-jakarta-sans.

Outputs: icon.png, apple-touch-icon.png, icon-maskable.png, icon-512.png,
icon-192.png, favicon.png, adaptive-icon.png (+ monochrome),
adaptive-icon-background.png, splash.png (on #F3F6F4).
"""
import math
import os
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'mobile', 'assets')
FONTS = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'node_modules', '@expo-google-fonts', 'plus-jakarta-sans')
SS = 4  # supersampling

EM600 = (0x0B, 0x8F, 0x65)
EM700 = (0x08, 0x75, 0x53)
EM800 = (0x06, 0x5A, 0x41)
EM900 = (0x04, 0x40, 0x2E)
BG = (0xF3, 0xF6, 0xF4)
INK = (0x0B, 0x1C, 0x15)
TEXT3 = (0x64, 0x73, 0x6C)
WHITE = (255, 255, 255)

F800 = f"{FONTS}/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf"
F500 = f"{FONTS}/500Medium/PlusJakartaSans_500Medium.ttf"


def gradient(w, h, c0, c1, angle_deg=150):
    """CSS-like linear-gradient(angle, c0, c1)."""
    a = math.radians(angle_deg)
    dx, dy = math.sin(a), -math.cos(a)
    # projection range over the box corners
    corners = [(x * dx + y * dy) for x in (0, w) for y in (0, h)]
    lo, hi = min(corners), max(corners)
    # 1-D ramp, then rotate-free fill via per-row computation (fast enough)
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = ((x * dx + y * dy) - lo) / (hi - lo)
            px[x, y] = tuple(round(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))
    return img


def gradient_fast(w, h, c0, c1, angle_deg=150):
    small = gradient(max(2, w // 16), max(2, h // 16), c0, c1, angle_deg)
    return small.resize((w, h), Image.BILINEAR)


def squircle_mask(size, n=5.0):
    s = size * SS
    m = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(m)
    a = s / 2
    pts = []
    steps = 720
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, si = math.cos(t), math.sin(t)
        x = a + a * math.copysign(abs(c) ** (2 / n), c)
        y = a + a * math.copysign(abs(si) ** (2 / n), si)
        pts.append((x, y))
    d.polygon(pts, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def draw_mark(img, cx, cy, D, color=WHITE, stroke_boost=1.0):
    """White double ring + « M » centred at (cx, cy) on an RGBA image."""
    w, h = img.size
    layer = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    S = SS
    # outer ring: outer edge diameter D, stroke 0.05 D (inward), 90 % white
    r1 = D / 2
    s1 = 0.05 * D * stroke_boost
    d.ellipse([(cx - r1) * S, (cy - r1) * S, (cx + r1) * S, (cy + r1) * S], outline=color + (230,), width=max(1, round(s1 * S)))
    # inner ring: outer edge 0.8 D, stroke D/30, 55 % white
    r2 = 0.8 * D / 2
    s2 = D / 30 * stroke_boost
    d.ellipse([(cx - r2) * S, (cy - r2) * S, (cx + r2) * S, (cy + r2) * S], outline=color + (140,), width=max(1, round(s2 * S)))
    # « M » Jakarta 800 at 0.433 D, optically centred on the cap height
    fs = 0.433 * D * S
    font = ImageFont.truetype(F800, round(fs))
    bbox = d.textbbox((0, 0), "M", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((cx * S - tw / 2 - bbox[0], cy * S - th / 2 - bbox[1]), "M", font=font, fill=color + (255,))
    layer = layer.resize((w, h), Image.LANCZOS)
    img.alpha_composite(layer)


def full_bleed(size, D_ratio, c0=EM700, c1=EM900, stroke_boost=0.8):
    img = gradient_fast(size, size, c0, c1).convert("RGBA")
    draw_mark(img, size / 2, size / 2, D_ratio * size, stroke_boost=stroke_boost)
    return img


def squircle_icon(size, D_ratio=0.75, c0=EM600, c1=EM800, stroke_boost=1.0):
    base = gradient_fast(size, size, c0, c1).convert("RGBA")
    draw_mark(base, size / 2, size / 2, D_ratio * size, stroke_boost=stroke_boost)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(base, (0, 0), squircle_mask(size))
    return out


def save_rgb(img, path):
    img.convert("RGB").save(path, optimize=True)


# iOS / Expo default icon: full bleed, no alpha (iOS applies its own mask)
save_rgb(full_bleed(1024, 0.68), f"{OUT}/icon.png")
# Apple touch icon (iOS home screen for the PWA): full bleed, no alpha
save_rgb(full_bleed(180, 0.68, stroke_boost=1.0), f"{OUT}/apple-touch-icon.png")
# Maskable PWA icon: full bleed, mark inside the 80 % safe circle
save_rgb(full_bleed(1024, 0.58), f"{OUT}/icon-maskable.png")
# PWA « any » icons + favicon: the squircle mark itself (transparent corners)
squircle_icon(512, stroke_boost=0.85).save(f"{OUT}/icon-512.png", optimize=True)
squircle_icon(192).save(f"{OUT}/icon-192.png", optimize=True)
squircle_icon(192, D_ratio=0.78, stroke_boost=1.35).save(f"{OUT}/favicon.png", optimize=True)
# Android adaptive icon: white mark on transparent (inside the 66 dp safe zone),
# gradient background layer; the foreground doubles as the monochrome icon.
fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
draw_mark(fg, 512, 512, 0.5 * 1024, stroke_boost=0.85)
fg.save(f"{OUT}/adaptive-icon.png", optimize=True)
save_rgb(gradient_fast(1024, 1024, EM700, EM900), f"{OUT}/adaptive-icon-background.png")

# Splash: brand mark + wordmark on the app background #F3F6F4 (same as
# splash.backgroundColor, so `contain` never shows a box).
W, H = 1284, 2778
splash = Image.new("RGBA", (W, H), BG + (255,))
mark = 216
mx, my = (W - mark) // 2, H // 2 - 250
# soft emerald shadow (elevation.mark)
sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
shm = squircle_mask(mark)
shadow = Image.new("RGBA", (mark, mark), EM700 + (90,))
sh.paste(shadow, (mx, my + 24), shm)
sh = sh.filter(ImageFilter.GaussianBlur(36))
splash.alpha_composite(sh)
splash.alpha_composite(squircle_icon(mark), (mx, my))
d = ImageDraw.Draw(splash)
f1 = ImageFont.truetype(F800, 84)
f2 = ImageFont.truetype(F500, 42)
t1, t2 = "MargeBar Pro", "par La Brasserie des Plantes"
b1 = d.textbbox((0, 0), t1, font=f1)
b2 = d.textbbox((0, 0), t2, font=f2)
y1 = my + mark + 64
d.text(((W - (b1[2] - b1[0])) / 2 - b1[0], y1 - b1[1]), t1, font=f1, fill=INK)
y2 = y1 + (b1[3] - b1[1]) + 30
d.text(((W - (b2[2] - b2[0])) / 2 - b2[0], y2 - b2[1]), t2, font=f2, fill=TEXT3)
save_rgb(splash, f"{OUT}/splash.png")
print("ok")
