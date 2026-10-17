# Watchlist Bridge

Films you add to **My List** on Netflix land on your **Letterboxd watchlist**, and Letterboxd films play on Netflix in
one click.

Works in Chrome, Edge, Brave and Opera (Manifest V3). Not affiliated with Netflix or Letterboxd.

## Install from source

1. Download or clone this folder.
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick this folder (the one with `manifest.json`).
5. Pin the extension from the puzzle-piece menu.

Stay signed in to **Netflix** and **Letterboxd** in that browser. No password or API key is needed.

## What it does

**Netflix → Letterboxd**

- **Scan my Netflix list** in the extension menu opens Netflix on My List, scrolls through it and sends every title
  to Letterboxd.
- After that, clicking **Add to My List (+)** on Netflix adds the film to your Letterboxd watchlist within seconds,
  with a small notification in the corner.
- Opening My List yourself also picks up anything new.

**Letterboxd → Netflix**

- Film pages get a red **Watch on Netflix** button above "Where to watch" when the film is on Netflix in your
  country, or a "Search on Netflix" link when it isn't.
- On your watchlist, posters you can stream get a play badge, and **Netflix only** hides the rest.
- In Settings, choose whether a click starts playback right away or opens the Netflix title page.

## How matching works

Netflix often shows translated titles, while Letterboxd uses English or original titles. So for each title the
extension:

1. reads the film's English title, year and type (film or show) from Netflix's public title page;
2. searches Letterboxd for that title;
3. checks each candidate's "Where to watch" data for **the same Netflix ID**. If it's there, the match is certain;
4. if that can't confirm it, accepts a single film with exactly the same title and year (can be turned off);
5. puts anything still uncertain under **Needs review** in the menu, where you pick the film, paste a Letterboxd
   link or skip it. The toolbar badge shows how many are waiting.

TV shows are skipped because Letterboxd lists films.

## Good to know

- **One way only:** removing a title from My List doesn't remove it from Letterboxd. (Logging a film as watched on
  Letterboxd already takes it off the watchlist.)
- Letterboxd has no public API, so the extension uses the requests Letterboxd's own site makes, with your browser
  session. If a direct request is rejected, it briefly opens a background Letterboxd tab, adds the film from there
  and closes the tab.
- If Netflix or Letterboxd change their pages, parts of this can break. Catching the Add to My List click is the
  most fragile part; **Scan my Netflix list** is the most reliable fallback.
- "Where to watch" data comes from JustWatch and reflects your current country's catalog.
- Nothing goes to a third-party server. The extension only talks to `netflix.com` and `letterboxd.com`, and stores
  everything in your browser. See [PRIVACY.md](PRIVACY.md).

## Project layout

```
manifest.json          extension manifest
background.js          queue, adding to Letterboxd, messaging (service worker)
lib/core.js            matching logic (no DOM, also tested in Node)
content/netflix.js     My List scan + Add to My List detection
content/letterboxd.js  film page button, poster badges, watchlist filter
popup/                 extension menu
tests/                 Node tests
store/                 Chrome Web Store listing text, image sources and renders
```

## Development

Tests need Node 18+ and no dependencies:

```bash
npm test
```

After editing, press reload (↻) on the extension card in `chrome://extensions`.

### Store assets

`store/assets/*.html` are the sources for the Web Store screenshots and promo tiles. They use the extension's real
CSS and the real popup. To regenerate the PNGs in `store/out/` (needs Python with Pillow and Chrome or Edge):

```bash
python store/make_icons.py
```

```bash
python store/render.py
```

### Packaging

```bash
python store/package.py
```

This writes `dist/watchlist-bridge-<version>.zip` with `manifest.json` at the root, ready to upload.
