"""Builds the Chrome Web Store upload: dist/watchlist-bridge-<version>.zip, manifest.json at the zip root.

Run: python store/package.py
"""
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = ['manifest.json', 'background.js']
DIRS = ['lib', 'content', 'popup', 'icons']


def main():
    version = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))['version']
    out = ROOT / 'dist' / f'watchlist-bridge-{version}.zip'
    out.parent.mkdir(exist_ok=True)
    paths = [ROOT / f for f in FILES] + [p for d in DIRS for p in sorted((ROOT / d).rglob('*')) if p.is_file()]
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in paths:
            z.write(p, p.relative_to(ROOT).as_posix())
    print(out.relative_to(ROOT))
    for name in zipfile.ZipFile(out).namelist():
        print('  ', name)


if __name__ == '__main__':
    main()
