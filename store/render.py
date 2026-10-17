"""Renders the Web Store screenshots and promo tiles from store/assets/*.html with headless Chrome.

Run: python store/render.py [name ...]
Output: store/out/*.png as 24-bit PNG without alpha, as the Web Store requires.
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ASSETS = HERE / 'assets'
OUT = HERE / 'out'
CHROME_PATHS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'google-chrome',
    'chromium',
]

JOBS = {
    'screenshot-1-overview': ('shot-1-hero.html', 1280, 800),
    'screenshot-2-film-page': ('shot-2-film.html', 1280, 800),
    'screenshot-3-watchlist': ('shot-3-watchlist.html', 1280, 800),
    'screenshot-4-matching': ('shot-4-review.html', 1280, 800),
    'screenshot-5-netflix': ('shot-5-netflix.html', 1280, 800),
    'promo-small-440x280': ('promo-small.html', 440, 280),
    'promo-marquee-1400x560': ('promo-marquee.html', 1400, 560),
}


def chrome():
    for p in CHROME_PATHS:
        if Path(p).exists() or shutil.which(p):
            return p
    sys.exit('Chrome/Edge not found; add its path to CHROME_PATHS')


def render(name, html, w, h, exe, profile):
    raw = OUT / f'{name}.raw.png'
    subprocess.run(
        [
            exe,
            '--headless=new',
            '--disable-gpu',
            '--hide-scrollbars',
            '--run-all-compositor-stages-before-draw',
            '--force-device-scale-factor=1',
            '--allow-file-access-from-files',
            f'--user-data-dir={profile}',
            # Taller than needed: headless Chrome sometimes lays out a viewport ~100px short; crop afterwards.
            f'--window-size={w},{h + 200}',
            '--virtual-time-budget=8000',
            f'--screenshot={raw}',
            (ASSETS / html).as_uri(),
        ],
        check=True,
        timeout=90,
        capture_output=True,
    )
    img = Image.open(raw).convert('RGB')
    img = img.crop((0, 0, w, h))
    img.save(OUT / f'{name}.png', optimize=True)
    raw.unlink()
    print(f'{name}.png  {img.size[0]}x{img.size[1]}')


def main():
    OUT.mkdir(exist_ok=True)
    names = sys.argv[1:] or list(JOBS)
    exe = chrome()
    with tempfile.TemporaryDirectory() as profile:
        for n in names:
            render(n, *JOBS[n], exe, profile)


if __name__ == '__main__':
    main()
