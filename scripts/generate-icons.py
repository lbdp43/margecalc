"""Generate MargeBar Pro app icons — atelier ink-stamp M monogram.

Recreates the V1 Velvet/Atelier design: emerald double ring with an
italic serif "M" on a cream-paper field.
"""
import os
from PIL import Image, ImageDraw, ImageFont

# Atelier emerald palette
EMERALD = (27, 122, 85)         # #1B7A55  — primary ink
EMERALD_DEEP = (14, 77, 52)     # #0E4D34  — outer ring
CREAM = (232, 239, 221)         # #E8EFDD  — paper background
CREAM_HI = (251, 253, 242)      # #FBFDF2  — bright paper
ON_ACCENT = (243, 248, 236)     # #F3F8EC  — text on emerald

OUT_DIR = '/home/user/margecalc/mobile/assets'


def find_serif_italic(size: int) -> ImageFont.FreeTypeFont:
    """Pick the best available italic-serif font for the M."""
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


def draw_stamp(size: int, bg=CREAM) -> Image.Image:
    """Render the M ink-stamp into a square RGB image."""
    img = Image.new('RGB', (size, size), bg)
    draw = ImageDraw.Draw(img, 'RGBA')

    cx = cy = size / 2
    outer_r = size * 0.42
    inner_r = size * 0.36
    stroke = max(2, int(size * 0.020))

    # Outer ring
    draw.ellipse(
        (cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r),
        outline=EMERALD,
        width=stroke,
    )
    # Inner faint ring
    draw.ellipse(
        (cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r),
        outline=(*EMERALD, 150),
        width=max(1, int(size * 0.010)),
    )

    # The italic serif M
    font = find_serif_italic(int(size * 0.46))
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


def draw_adaptive_foreground(size: int) -> Image.Image:
    """Android adaptive-icon foreground — RGBA, stamp inside a 66 % safe area."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    safe = int(size * 0.66)
    stamp_canvas = Image.new('RGBA', (safe, safe), (0, 0, 0, 0))
    stamp_draw = ImageDraw.Draw(stamp_canvas, 'RGBA')
    cx = cy = safe / 2
    outer_r = safe * 0.45
    inner_r = safe * 0.39
    stroke = max(2, int(safe * 0.022))
    stamp_draw.ellipse(
        (cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r),
        outline=EMERALD,
        width=stroke,
    )
    stamp_draw.ellipse(
        (cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r),
        outline=(*EMERALD, 160),
        width=max(1, int(safe * 0.011)),
    )
    font = find_serif_italic(int(safe * 0.50))
    bbox = stamp_draw.textbbox((0, 0), 'M', font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    stamp_draw.text(
        (cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1] - safe * 0.02),
        'M',
        fill=EMERALD,
        font=font,
    )
    offset = (size - safe) // 2
    img.paste(stamp_canvas, (offset, offset), stamp_canvas)
    return img


def draw_splash(width: int, height: int) -> Image.Image:
    """Splash screen with stamp + wordmark on cream paper."""
    img = Image.new('RGB', (width, height), CREAM)
    draw = ImageDraw.Draw(img, 'RGBA')

    stamp_size = int(min(width, height) * 0.35)
    stamp = draw_stamp(stamp_size, bg=CREAM)
    sx = (width - stamp_size) // 2
    sy = (height - stamp_size) // 2 - int(min(width, height) * 0.10)
    img.paste(stamp, (sx, sy))

    # Italic serif wordmark
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

    # 1024x1024 main app icon (cream paper background)
    icon = draw_stamp(1024, bg=CREAM)
    icon.save(os.path.join(OUT_DIR, 'icon.png'), 'PNG')
    print('Generated icon.png (1024x1024)')

    # 1024x1024 adaptive foreground (transparent — Android composes with bg color)
    adaptive = draw_adaptive_foreground(1024)
    adaptive.save(os.path.join(OUT_DIR, 'adaptive-icon.png'), 'PNG')
    print('Generated adaptive-icon.png (1024x1024, transparent)')

    # 192x192 favicon (PWA / browser tab)
    fav = draw_stamp(192, bg=CREAM)
    fav.save(os.path.join(OUT_DIR, 'favicon.png'), 'PNG')
    print('Generated favicon.png (192x192)')

    # Splash screen 1284x2778
    splash = draw_splash(1284, 2778)
    splash.save(os.path.join(OUT_DIR, 'splash.png'), 'PNG')
    print('Generated splash.png (1284x2778)')


if __name__ == '__main__':
    main()
