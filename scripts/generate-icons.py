"""Generate MargeBar Pro app icons - atelier ink-stamp M monogram.

Renders a high-resolution master at 2048x2048, then resamples down to
each target size with LANCZOS for crisp edges on retina / hi-DPI
launchers (Android 432dp adaptive, iOS 180pt apple-touch).

Outputs:
  icon.png          - 1024x1024 main app icon (cream background)
  icon-512.png      - 512x512 PWA icon
  icon-192.png      - 192x192 PWA icon
  icon-maskable.png - 1024x1024 with cream fill-bleed (for adaptive masks)
  adaptive-icon.png - 1024x1024 transparent foreground (Android adaptive)
  favicon.png       - 192x192 (browser tab)
  splash.png        - 1284x2778 cream splash with stamp + wordmark
"""
import os
from PIL import Image, ImageDraw, ImageFont

# Atelier emerald palette
EMERALD = (27, 122, 85)
EMERALD_DEEP = (14, 77, 52)
CREAM = (232, 239, 221)

OUT_DIR = '/home/user/margecalc/mobile/assets'
SUPER = 2048  # supersampled master size


def find_serif_italic(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def render_master_stamp(size: int, bg, transparent: bool = False, ring_scale: float = 1.0) -> Image.Image:
    """Render the M ink-stamp at the requested size as RGBA.

    ring_scale<1.0 leaves more padding inside the canvas - useful for the
    Android maskable icon which needs the design to sit in the inner 80%.
    """
    if transparent:
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    else:
        img = Image.new('RGBA', (size, size), (*bg, 255))
    draw = ImageDraw.Draw(img, 'RGBA')

    cx = cy = size / 2
    outer_r = size * 0.42 * ring_scale
    inner_r = size * 0.36 * ring_scale
    stroke = max(2, int(size * 0.020 * ring_scale))
    inner_stroke = max(1, int(size * 0.010 * ring_scale))

    draw.ellipse(
        (cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r),
        outline=EMERALD,
        width=stroke,
    )
    draw.ellipse(
        (cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r),
        outline=(*EMERALD, 150),
        width=inner_stroke,
    )

    font = find_serif_italic(int(size * 0.46 * ring_scale))
    bbox = draw.textbbox((0, 0), 'M', font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text(
        (cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1] - size * 0.02),
        'M',
        fill=EMERALD,
        font=font,
    )
    return img


def downsample(master: Image.Image, target: int) -> Image.Image:
    return master.resize((target, target), Image.LANCZOS)


def render_splash(width: int, height: int) -> Image.Image:
    img = Image.new('RGB', (width, height), CREAM)
    draw = ImageDraw.Draw(img, 'RGBA')

    stamp_size = int(min(width, height) * 0.35)
    # Render at 2x then downsample for crisp edges
    master = render_master_stamp(stamp_size * 2, bg=CREAM, transparent=False)
    stamp = master.resize((stamp_size, stamp_size), Image.LANCZOS)
    sx = (width - stamp_size) // 2
    sy = (height - stamp_size) // 2 - int(min(width, height) * 0.10)
    img.paste(stamp.convert('RGB'), (sx, sy))

    title_font = find_serif_italic(int(min(width, height) * 0.06))
    sub_font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    sub_font = (ImageFont.truetype(sub_font_path, int(min(width, height) * 0.025))
                if os.path.exists(sub_font_path) else ImageFont.load_default())

    title = 'MargeBar Pro'
    bbox = draw.textbbox((0, 0), title, font=title_font)
    tw = bbox[2] - bbox[0]
    title_y = sy + stamp_size + int(min(width, height) * 0.04)
    draw.text(((width - tw) / 2, title_y), title, fill=(20, 36, 27), font=title_font)

    sub = 'Calculez vos marges'
    bbox2 = draw.textbbox((0, 0), sub, font=sub_font)
    tw2 = bbox2[2] - bbox2[0]
    draw.text(
        ((width - tw2) / 2, title_y + int(min(width, height) * 0.07)),
        sub,
        fill=EMERALD,
        font=sub_font,
    )
    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # 1) High-res master with cream background, downsample to all PNG sizes
    master_cream = render_master_stamp(SUPER, bg=CREAM, transparent=False)

    sizes_cream = [
        ('icon.png', 1024),
        ('icon-512.png', 512),
        ('icon-192.png', 192),
        ('favicon.png', 192),
    ]
    for name, target in sizes_cream:
        img = downsample(master_cream, target).convert('RGB')
        img.save(os.path.join(OUT_DIR, name), 'PNG', optimize=True)
        print(f'Generated {name} ({target}x{target})')

    # 2) Maskable variant: cream-filled but with ring scaled inside the 80%
    # safe zone Android applies for adaptive masks.
    master_mask = render_master_stamp(SUPER, bg=CREAM, transparent=False, ring_scale=0.78)
    img = downsample(master_mask, 1024).convert('RGB')
    img.save(os.path.join(OUT_DIR, 'icon-maskable.png'), 'PNG', optimize=True)
    print('Generated icon-maskable.png (1024x1024)')

    # 3) Transparent adaptive foreground (Android composes with bg color)
    master_transparent = render_master_stamp(SUPER, bg=CREAM, transparent=True, ring_scale=0.66)
    img = downsample(master_transparent, 1024)
    img.save(os.path.join(OUT_DIR, 'adaptive-icon.png'), 'PNG', optimize=True)
    print('Generated adaptive-icon.png (1024x1024, transparent)')

    # 4) Splash (1284x2778)
    splash = render_splash(1284, 2778)
    splash.save(os.path.join(OUT_DIR, 'splash.png'), 'PNG', optimize=True)
    print('Generated splash.png (1284x2778)')


if __name__ == '__main__':
    main()
