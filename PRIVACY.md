# Watchlist Bridge privacy policy

_Last updated: October 17, 2026_

Watchlist Bridge is a browser extension that adds films from your Netflix "My List" to your Letterboxd watchlist and
shows "Watch on Netflix" links on Letterboxd. This policy explains what data it handles.

## The short version

- The extension has no server. The developer does not receive, collect, store or sell any of your data.
- It only talks to **netflix.com** and **letterboxd.com**, using the sessions you are already signed in with.
- Everything it remembers is stored locally in your browser.

## What the extension reads

- **On netflix.com:** the titles and Netflix IDs on your My List page, and which title you clicked "Add to My List" on.
  It also loads Netflix's public title page for those IDs to get each film's English title and release year.
- **On letterboxd.com:** search results, the "Where to watch" section of film pages (to see whether a film is on
  Netflix), and which films appear on the page you are viewing (to show the Netflix badge).

It does not read passwords, payment details, viewing history, messages or anything else on those sites.

## What is sent, and where

- Film titles from your Netflix list are sent to **letterboxd.com** to search for the matching film.
- When a match is found, the film is added to your Letterboxd watchlist through **letterboxd.com**, using your
  existing Letterboxd session.
- Netflix title IDs are used to request Netflix's public title pages from **netflix.com**.

These requests go directly from your browser to Netflix and Letterboxd. No other party receives them.

## What is stored

Stored with `chrome.storage.local`, on your device only:

- the list of titles the extension has processed, their Letterboxd matches and their sync status;
- a temporary cache of which Letterboxd films are on Netflix (entries expire after 3 days);
- your settings.

This data is removed when you uninstall the extension.

## What the extension does not do

- No analytics, tracking, advertising or fingerprinting.
- No selling or sharing of data with third parties.
- No use of your data for anything other than syncing your lists and showing Netflix links.
- No remote code: all code ships inside the extension package.

## Changes and contact

If this policy changes, the new version will be published at the same address with a new date.

Questions: open an issue at https://github.com/sametgurtuna/watchlist-bridge/issues or write to the developer
contact listed on the Chrome Web Store page.

Watchlist Bridge is an independent project and is not affiliated with, endorsed by or sponsored by Netflix, Inc. or
Letterboxd Limited.
