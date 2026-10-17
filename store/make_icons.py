"""Draws the Watchlist Bridge icon: a bookmark (watchlist) with a play button, on a dark tile.

Run: python store/make_icons.py
Writes icons/icon{16,32,48,128}.png (toolbar/extension icons, tile fills the canvas)
and store/out/store-icon-128.png (Web Store icon: 96x96 artwork with 16px transparent padding).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
S = 1024  # draw large, then downscale for clean edges

RED = (255, 69, 87)
AMBER = (255, 165, 61)
TILE_TOP = (36, 43, 52)
TILE_BOTTOM = (16, 20, 25)


def vgradient(size, top, bottom):
    w, h = size
    col = Image.new('RGB', (1, h))
    for y in range(h):
        t = y / max(h - 1, 1)
        col.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    return col.resize((w, h))


def tile(size):
    """Rounded dark tile with the bookmark, `size` px square, fully opaque inside the tile."""
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))

    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.23), fill=255)
    img.paste(vgradient((S, S), TILE_TOP, TILE_BOTTOM), (0, 0), mask)

    # hairline highlight along the top edge so the tile reads on dark backgrounds
    rim = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(rim)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.23), outline=40, width=int(S * 0.012))
    img.paste((255, 255, 255), (0, 0), rim)

    # bookmark (wider at toolbar sizes so it stays legible)
    small = size <= 32
    l, r, t, b = (S * 0.24, S * 0.76, S * 0.12, S * 0.9) if small else (S * 0.30, S * 0.70, S * 0.17, S * 0.85)
    notch = S * (0.17 if small else 0.15)
    bm = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(bm)
    d.rounded_rectangle([l, t, r, b], radius=int(S * 0.06), fill=255)
    d.polygon([(l - 2, b + 2), ((l + r) / 2, b - notch), (r + 2, b + 2)], fill=0)

    shadow = bm.filter(ImageFilter.GaussianBlur(S * 0.03))
    img.paste((0, 0, 0), (0, int(S * 0.02)), shadow.point(lambda v: v * 0.45))
    img.paste(vgradient((S, S), RED, AMBER).crop((0, 0, S, S)), (0, 0), bm)

    # play triangle, nudged right for optical centre
    cx, cy, h = S * 0.515, S * (0.43 if small else 0.45), S * (0.28 if small else 0.22)
    ImageDraw.Draw(img).polygon(
        [(cx - h * 0.38, cy - h / 2), (cx - h * 0.38, cy + h / 2), (cx + h * 0.5, cy)], fill=(255, 255, 255)
    )
    return img.resize((size, size), Image.LANCZOS)


def main():
    (ROOT / 'icons').mkdir(exist_ok=True)
    (ROOT / 'store' / 'out').mkdir(parents=True, exist_ok=True)
    for n in (16, 32, 48, 128):
        tile(n).save(ROOT / 'icons' / f'icon{n}.png')
    store = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    store.paste(tile(96), (16, 16))
    store.save(ROOT / 'store' / 'out' / 'store-icon-128.png')
    print('icons written')


if __name__ == '__main__':
    main()
