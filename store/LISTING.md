# Chrome Web Store submission: Watchlist Bridge

Everything to paste into the Developer Dashboard, tab by tab. Images are in `store/out/`, the package is
`dist/watchlist-bridge-1.0.0.zip`.

---

## Package

Upload `dist/watchlist-bridge-1.0.0.zip` (manifest.json is at the root of the zip, as the store requires).

## Store listing tab

**Title** (from package): `Watchlist Bridge`

**Summary** (from package, 121/132 chars):

```
Films you add to My List on Netflix land on your Letterboxd watchlist, and Letterboxd films play on Netflix in one click.
```

**Description** (copy everything inside the box):

```
Watchlist Bridge connects your Netflix My List with your Letterboxd watchlist, in both directions.

NETFLIX → LETTERBOXD
• Add a film to My List on Netflix and it's added to your Letterboxd watchlist a few seconds later.
• "Scan my Netflix list" imports everything that's already on your list in one go.
• Works with translated titles. Each film is matched through Letterboxd's own link to the same Netflix title, so a film shown as "Le Long Silence" on a French profile still lands on your watchlist as the right film.
• Not sure about a match? It asks instead of guessing: pick the right film, paste a Letterboxd link, or skip it.
• TV shows are skipped, since Letterboxd lists films.

LETTERBOXD → NETFLIX
• A "Watch on Netflix" button appears on Letterboxd film pages when the film is streaming on Netflix in your country.
• Posters on your watchlist that you can stream get a play badge, and "Netflix only" hides everything else.
• Choose whether a click starts playback straight away or opens the film's Netflix page.

PRIVATE BY DESIGN
• No account, password or API key. It uses the Netflix and Letterboxd sessions already in your browser.
• It only talks to netflix.com and letterboxd.com. There is no server in between, and no analytics or tracking.
• Your sync history and settings stay in your browser.

GETTING STARTED
1. Stay signed in to Netflix and Letterboxd in Chrome.
2. Click the Watchlist Bridge icon and press "Scan my Netflix list".
3. From then on, adding a film to My List on Netflix is all it takes.

GOOD TO KNOW
• Sync is one way: removing a title from My List doesn't remove it from your Letterboxd watchlist.
• Netflix and Letterboxd can change their websites at any time. If something stops working, scanning again from the menu usually fixes it while an update is on the way.

Watchlist Bridge is an independent project. It is not affiliated with, endorsed by or sponsored by Netflix, Inc. or Letterboxd Limited. Netflix and Letterboxd are trademarks of their respective owners.
```

**Category:** `Entertainment` (under Lifestyle)

**Language:** `English`

### Graphic assets

| Field | File |
| --- | --- |
| Store icon (128×128) | `store/out/store-icon-128.png` |
| Screenshot 1 | `store/out/screenshot-1-overview.png` |
| Screenshot 2 | `store/out/screenshot-2-film-page.png` |
| Screenshot 3 | `store/out/screenshot-3-watchlist.png` |
| Screenshot 4 | `store/out/screenshot-4-matching.png` |
| Screenshot 5 | `store/out/screenshot-5-netflix.png` |
| Small promo tile (440×280) | `store/out/promo-small-440x280.png` |
| Marquee promo tile (1400×560) | `store/out/promo-marquee-1400x560.png` |
| Global promo video | leave empty (optional) |

All screenshots and tiles are 24-bit PNG without alpha. Film titles and posters in them are invented, so no
studio artwork is used.

### Additional fields

- **Official URL:** `None` (only needed if you verified a site in Google Search Console).
- **Homepage URL:** `https://github.com/sametgurtuna/watchlist-bridge`
- **Support URL:** `https://github.com/sametgurtuna/watchlist-bridge/issues`
- **Mature content:** `No`.

---

## Privacy practices tab

**Single purpose description:**

```
Watchlist Bridge keeps a user's Netflix My List and Letterboxd watchlist in sync, and links Letterboxd film pages to the same title on Netflix.
```

**Permission justifications:**

`storage`

```
Stores the sync queue, the Netflix-to-Letterboxd film matches, a short-lived cache of which Letterboxd films are on Netflix, and the user's settings, locally in the browser.
```

`scripting`

```
Used only as a fallback when adding a film to the Letterboxd watchlist: if the background request is rejected, the same add-to-watchlist request is run inside an open letterboxd.com tab so it uses the user's existing Letterboxd session. No other code is injected.
```

`alarms`

```
Wakes the background service worker every 30 minutes to finish a sync that was interrupted (for example when the browser suspended the worker).
```

Host permission `https://www.netflix.com/*`

```
Reads the titles on the user's My List page and detects clicks on "Add to My List", so new films can be sent to Letterboxd. Also loads Netflix's public title page for a film to get its English title and year for matching.
```

Host permission `https://letterboxd.com/*`

```
Searches Letterboxd for the matching film, reads the "Where to watch" section to confirm the Netflix match, adds the film to the user's watchlist, and shows the "Watch on Netflix" button and poster badges on Letterboxd pages.
```

**Are you using remote code?** `No, I am not using remote code.`

**Data usage.** The developer collects nothing, but titles from the Netflix list are sent to Letterboxd to find
the film. The conservative choice is to declare:

- [x] **Website content** (film titles read from Netflix and Letterboxd pages)
- [x] **User activity** (the extension reacts to clicks on Netflix's "Add to My List" button)

Leave every other category unchecked, then tick all three certifications:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** `https://github.com/sametgurtuna/watchlist-bridge/blob/main/PRIVACY.md`

---

## Note for the reviewer (optional, under "Additional information" if asked)

```
To test: sign in to Netflix and Letterboxd in the same browser. Open the extension popup and click "Scan my Netflix list"; Netflix opens on My List and the films on it are added to the Letterboxd watchlist (progress is shown in the popup). On any Letterboxd film page that is streaming on Netflix in the reviewer's country, a red "Watch on Netflix" button appears above "Where to watch".
```
