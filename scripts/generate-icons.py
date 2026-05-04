"""Generate MargeBar Pro app icons — a plant growing from a coin/pot."""
from PIL import Image, ImageDraw, ImageFont
import math
import os

# Colors from the app's green palette
PRIMARY = (27, 67, 50)      # #1B4332
SECONDARY = (45, 106, 79)   # #2D6A4F
ACCENT = (64, 145, 108)     # #40916C
LIGHT = (216, 243, 220)     # #D8F3DC
WHITE = (255, 255, 255)
BG = (27, 67, 50)           # same as primary

def draw_icon(size):
    img = Image.new('RGBA', (size, size), BG)
    d = ImageDraw.Draw(img)
    s = size / 1024  # scale factor
    cx, cy = size // 2, size // 2

    # --- Background circle (subtle lighter ring) ---
    ring_r = int(420 * s)
    d.ellipse(
        [cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r],
        fill=(34, 80, 60),  # slightly lighter than BG
    )

    inner_r = int(380 * s)
    d.ellipse(
        [cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r],
        fill=BG,
    )

    # --- Pot / base ---
    pot_w = int(180 * s)
    pot_h = int(120 * s)
    pot_top = cy + int(100 * s)
    pot_bottom = pot_top + pot_h
    pot_rim_h = int(25 * s)

    # Pot body (trapezoid via polygon)
    pot_top_half = pot_w // 2
    pot_bot_half = int(pot_w * 0.7) // 2
    pot_body = [
        (cx - pot_top_half, pot_top + pot_rim_h),
        (cx + pot_top_half, pot_top + pot_rim_h),
        (cx + pot_bot_half, pot_bottom),
        (cx - pot_bot_half, pot_bottom),
    ]
    d.polygon(pot_body, fill=SECONDARY)

    # Pot rim (rounded rectangle at top)
    rim_extra = int(20 * s)
    d.rounded_rectangle(
        [cx - pot_top_half - rim_extra, pot_top - int(5 * s),
         cx + pot_top_half + rim_extra, pot_top + pot_rim_h + int(5 * s)],
        radius=int(12 * s),
        fill=ACCENT,
    )

    # Soil line
    soil_y = pot_top + pot_rim_h + int(8 * s)
    d.rounded_rectangle(
        [cx - pot_top_half + int(10 * s), soil_y,
         cx + pot_top_half - int(10 * s), soil_y + int(12 * s)],
        radius=int(6 * s),
        fill=(35, 85, 60),
    )

    # --- Main stem ---
    stem_w = int(10 * s)
    stem_bottom = pot_top + int(5 * s)
    stem_top = cy - int(220 * s)

    # Stem (slightly curved via multiple rectangles)
    for y in range(int(stem_top), int(stem_bottom), 2):
        t = (y - stem_top) / (stem_bottom - stem_top)
        offset_x = int(math.sin(t * 0.5) * 15 * s)
        hw = stem_w // 2 + int(t * 3 * s)  # slightly thicker at bottom
        d.rectangle(
            [cx + offset_x - hw, y, cx + offset_x + hw, y + 3],
            fill=ACCENT,
        )

    # --- Leaves ---
    def draw_leaf(center_x, center_y, angle_deg, leaf_len, leaf_w, color):
        """Draw an elliptical leaf at an angle."""
        leaf_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        ld = ImageDraw.Draw(leaf_img)
        # Draw leaf as ellipse centered at origin, then rotate
        lx, ly = size // 2, size // 2
        ld.ellipse(
            [lx - leaf_len // 2, ly - leaf_w // 2,
             lx + leaf_len // 2, ly + leaf_w // 2],
            fill=color,
        )
        # Draw center vein
        ld.line(
            [lx - leaf_len // 2 + int(8 * s), ly, lx + leaf_len // 2 - int(8 * s), ly],
            fill=(max(0, color[0] - 15), max(0, color[1] - 15), max(0, color[2] - 10)),
            width=max(1, int(2 * s)),
        )
        rotated = leaf_img.rotate(-angle_deg, center=(lx, ly), resample=Image.BICUBIC)
        # Paste at offset position
        offset_x = center_x - lx
        offset_y = center_y - ly
        shifted = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        shifted.paste(rotated, (offset_x, offset_y), rotated)
        img.alpha_composite(shifted)

    # Leaf positions along stem (from top to bottom)
    leaves = [
        # (y_ratio, side, angle, length_mult, width_mult, color)
        (0.05, 'left', -35, 1.1, 0.9, ACCENT),
        (0.05, 'right', 30, 1.0, 0.85, (80, 160, 120)),
        (0.15, 'right', 40, 1.3, 1.0, (70, 150, 110)),
        (0.15, 'left', -45, 1.2, 0.95, ACCENT),
        (0.30, 'left', -30, 1.0, 0.8, (80, 160, 120)),
        (0.30, 'right', 35, 0.9, 0.75, ACCENT),
        (0.45, 'right', 40, 0.8, 0.7, (70, 150, 110)),
        (0.45, 'left', -35, 0.85, 0.7, (80, 160, 120)),
        (0.60, 'left', -25, 0.7, 0.6, ACCENT),
        (0.60, 'right', 30, 0.65, 0.55, (70, 150, 110)),
    ]

    stem_height = stem_bottom - stem_top
    for y_ratio, side, angle, l_mult, w_mult, color in leaves:
        y = stem_top + stem_height * y_ratio
        t = y_ratio
        stem_offset = int(math.sin(t * 0.5) * 15 * s)
        leaf_len = int(110 * s * l_mult)
        leaf_w = int(50 * s * w_mult)
        if side == 'left':
            lx = cx + stem_offset - leaf_len // 3
        else:
            lx = cx + stem_offset + leaf_len // 3
        draw_leaf(lx, int(y), angle, leaf_len, leaf_w, color)

    # --- Top sprout / new growth ---
    sprout_y = stem_top - int(10 * s)
    # Two small new leaves at the very top
    draw_leaf(cx - int(25 * s), sprout_y, -50, int(60 * s), int(28 * s), LIGHT)
    draw_leaf(cx + int(25 * s), sprout_y, 50, int(55 * s), int(25 * s), LIGHT)

    # Small circle at very tip (growth point)
    tip_r = int(8 * s)
    d.ellipse(
        [cx - tip_r, sprout_y - int(15 * s) - tip_r,
         cx + tip_r, sprout_y - int(15 * s) + tip_r],
        fill=LIGHT,
    )

    # --- Small euro/coin symbol in the pot (subtle) ---
    coin_y = pot_top + pot_rim_h + int(45 * s)
    coin_r = int(22 * s)
    d.ellipse(
        [cx - coin_r, coin_y - coin_r, cx + coin_r, coin_y + coin_r],
        fill=(55, 120, 90),
        outline=(80, 155, 115),
        width=max(1, int(3 * s)),
    )
    # Euro sign approximation
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(28 * s))
    except (OSError, IOError):
        font = ImageFont.load_default()
    bbox = d.textbbox((0, 0), "\u20ac", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(
        (cx - tw // 2, coin_y - th // 2 - int(2 * s)),
        "\u20ac", fill=LIGHT, font=font,
    )

    return img.convert('RGB')


# Generate all icon sizes
out_dir = '/home/user/margecalc/mobile/assets'

# Main icon (1024x1024)
icon = draw_icon(1024)
icon.save(os.path.join(out_dir, 'icon.png'), 'PNG')
print('Generated icon.png (1024x1024)')

# Adaptive icon foreground (1024x1024)
icon.save(os.path.join(out_dir, 'adaptive-icon.png'), 'PNG')
print('Generated adaptive-icon.png (1024x1024)')

# Favicon (48x48)
favicon = draw_icon(192)
favicon_small = favicon.resize((48, 48), Image.LANCZOS)
favicon_small.save(os.path.join(out_dir, 'favicon.png'), 'PNG')
print('Generated favicon.png (48x48)')

# Splash screen (1284x2778 — iPhone 14 Pro Max size)
splash_w, splash_h = 1284, 2778
splash = Image.new('RGB', (splash_w, splash_h), BG)
# Center the icon on splash
splash_icon_size = 512
splash_icon = draw_icon(splash_icon_size)
paste_x = (splash_w - splash_icon_size) // 2
paste_y = (splash_h - splash_icon_size) // 2 - 200
splash.paste(splash_icon, (paste_x, paste_y))

# Add "MargeBar Pro" text below
sd = ImageDraw.Draw(splash)
try:
    title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 64)
    sub_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
except (OSError, IOError):
    title_font = ImageFont.load_default()
    sub_font = ImageFont.load_default()

text_y = paste_y + splash_icon_size + 60
bbox = sd.textbbox((0, 0), "MargeBar Pro", font=title_font)
tw = bbox[2] - bbox[0]
sd.text(((splash_w - tw) // 2, text_y), "MargeBar Pro", fill=LIGHT, font=title_font)

sub_text = "Calculez vos marges"
bbox2 = sd.textbbox((0, 0), sub_text, font=sub_font)
tw2 = bbox2[2] - bbox2[0]
sd.text(((splash_w - tw2) // 2, text_y + 90), sub_text, fill=ACCENT, font=sub_font)

splash.save(os.path.join(out_dir, 'splash.png'), 'PNG')
print('Generated splash.png (1284x2778)')
