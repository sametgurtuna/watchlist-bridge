// Netflix ↔ Letterboxd matching logic.
// No DOM access, so it runs both in the extension's service worker and in Node tests.

export const LB = 'https://letterboxd.com';
export const NF = 'https://www.netflix.com';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function normalizeTitle(s) {
  return String(s || '')
    .replace(/[ıİ]/g, (c) => (c === 'ı' ? 'i' : 'I'))
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’‘`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

export function decodeEntities(s) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, n) => named[n]);
}

const stripTags = (s) => String(s).replace(/<[^>]*>/g, '');
const cleanText = (s) => decodeEntities(stripTags(s)).replace(/[\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();

// Netflix's public title page (netflix.com/xx-en/title/ID, fetched without cookies):
// the first <h1> is the title; the first <li>s in the data-uia="metadata" block are year / seasons / rating.
export function parseNetflixTitlePage(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const i = html.indexOf('data-uia="metadata"');
  const seg = i >= 0 ? html.slice(i, i + 8000) : '';
  const lis = [...seg.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => cleanText(m[1])).slice(0, 6);
  const year = lis.find((x) => /^\d{4}$/.test(x));
  const isShow = lis.some((x) =>
    /\b\d+\s+(seasons?|episodes?|parts?|volumes?)\b|limited series|miniseries|\d+\s+sezon|\d+\s+bölüm|mini dizi/i.test(x)
  );
  return { title: h1 ? cleanText(h1) || null : null, year: year ? +year : null, isShow };
}

// Netflix title IDs from Letterboxd's "Where to watch" HTML.
// The links are wrapped in a JustWatch redirect: ...&r=https%3A%2F%2Fwww.netflix.com%2Ftitle%2F80175798
export function netflixIdsFromAvailability(html) {
  const ids = new Set();
  const re = /netflix\.com(?:%2F|\/)(?:[a-z]{2}(?:-[a-z]{2})?(?:%2F|\/))?(?:title|watch)(?:%2F|\/)(\d+)/gi;
  for (const m of html.matchAll(re)) ids.add(m[1]);
  return [...ids];
}

export function slugFromLetterboxdUrl(input) {
  const s = String(input || '').trim();
  const m = s.match(/letterboxd\.com\/(?:[^/]+\/)?film\/([a-z0-9-]+)/i);
  if (m) return m[1].toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(s) ? s.toLowerCase() : null;
}

export function rankCandidates(cands, queries, year) {
  const qs = [...new Set(queries.map(normalizeTitle).filter(Boolean))];
  return cands
    .map((c, i) => {
      const names = [c.name, c.originalName].filter(Boolean).map(normalizeTitle);
      const exact = names.some((n) => qs.includes(n));
      const partial = !exact && names.some((n) => qs.some((q) => n.includes(q) || q.includes(n)));
      const yearDiff = year && c.year ? Math.abs(year - c.year) : null;
      let score = exact ? 100 : partial ? 30 : 0;
      if (yearDiff != null) score += yearDiff === 0 ? 25 : yearDiff === 1 ? 15 : -Math.min(yearDiff, 20);
      score -= (c.rank ?? i) * 0.5;
      return { ...c, exact, yearDiff, score };
    })
    .sort((a, b) => b.score - a.score);
}

// verified: Letterboxd's Netflix link points to the same ID (certain).
// likely:   exact title + year ±1 and a single candidate (almost certainly right).
// review:   there are candidates but we're not sure; let the user pick.
export function decideMatch(ranked, { netflixId, year, isShow }) {
  const verified = ranked.find((c) => c.nfIds?.includes(netflixId));
  if (verified) return { kind: 'verified', pick: verified };
  // A film that is on Netflix under a different ID is most likely another film with the same title.
  const plausible = ranked.filter((c) => !c.nfIds?.length);
  const exactAll = ranked.filter((c) => c.exact);
  const strict = plausible.filter((c) => c.exact && (year ? c.yearDiff != null && c.yearDiff <= 1 : true));
  // Letterboxd has almost no TV shows; say "not found" rather than suggest an old film with the same name.
  if (isShow) return strict.length ? { kind: 'review', pick: strict[0] } : { kind: 'notfound' };
  if (strict.length === 1 && (year || exactAll.length === 1)) return { kind: 'likely', pick: strict[0] };
  if (ranked.length) return { kind: 'review', pick: strict[0] || plausible[0] || ranked[0] };
  return { kind: 'notfound' };
}

const simplify = (c) => c && { slug: c.slug, name: c.name, year: c.year ?? null, directors: c.directors || [] };

async function readUntil(res, test, max = 3_000_000) {
  if (!res.body?.getReader) return res.text();
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    if (test(text) || text.length > max) {
      reader.cancel().catch(() => {});
      break;
    }
  }
  return text;
}

export function createApi({ fetch: f = globalThis.fetch.bind(globalThis), gap = 300 } = {}) {
  let next = 0;
  async function lbGet(path) {
    // Keep at least `gap` ms between requests so we don't hammer Letterboxd.
    const slot = Math.max(Date.now(), next);
    next = slot + gap;
    if (slot > Date.now()) await sleep(slot - Date.now());
    const res = await f(LB + path, { credentials: 'include' });
    if (!res.ok) throw new Error(`Letterboxd HTTP ${res.status}`);
    return res;
  }

  async function searchFilms(q, limit = 8) {
    const res = await lbGet(`/s/autocompletefilm?q=${encodeURIComponent(q)}&limit=${limit}`);
    const json = await res.json();
    return (json.data || [])
      .filter((d) => d.slug && (!d.type || d.type === 'film'))
      .map((d) => ({
        slug: d.slug,
        name: d.name,
        originalName: d.originalName || null,
        year: d.releaseYear || null,
        directors: (d.directors || []).map((x) => x.name),
      }));
  }

  async function netflixIdsForSlug(slug) {
    const res = await lbGet(`/csi/film/${encodeURIComponent(slug)}/availability/`);
    return netflixIdsFromAvailability(await res.text());
  }

  async function netflixMeta(id) {
    // Without cookies Netflix serves the public page, in the language picked from Accept-Language.
    // If it still redirects to a local-language page (e.g. /tr/), ask for the English one (/tr-en/).
    const get = (path) =>
      f(`${NF}${path}/title/${id}`, { credentials: 'omit', headers: { 'Accept-Language': 'en-US,en;q=0.9' } });
    let res = await get('');
    const loc = res.url.match(/netflix\.com\/([a-z]{2})(-[a-z]{2})?\/title\//);
    if (loc && loc[2] !== '-en') {
      const alt = await get(`/${loc[1]}-en`).catch(() => null);
      if (alt?.ok && alt.url.includes(`/title/${id}`)) {
        res.body?.cancel().catch(() => {});
        res = alt;
      }
    }
    if (!res.ok || !res.url.includes(`/title/${id}`)) return null;
    const html = await readUntil(res, (t) => {
      const i = t.indexOf('data-uia="metadata"');
      return i >= 0 && t.length > i + 8000;
    });
    const meta = parseNetflixTitlePage(html);
    return meta.title ? meta : null;
  }

  async function resolve({ id, nfTitle }, { avail } = {}) {
    const pool = new Map();
    const nfIds = new Map();
    const addAll = (list) => list.forEach((c) => pool.has(c.slug) || pool.set(c.slug, { ...c, rank: pool.size }));
    const idsFor = async (slug) => {
      if (nfIds.has(slug)) return nfIds.get(slug);
      let ids = avail?.get(slug);
      if (!ids) {
        ids = await netflixIdsForSlug(slug);
        avail?.set(slug, ids);
      }
      nfIds.set(slug, ids);
      return ids;
    };
    const verify = async (list) => {
      for (const c of list) if ((await idsFor(c.slug)).includes(id)) return c;
      return null;
    };
    const withIds = (list) => list.map((c) => (nfIds.has(c.slug) ? { ...c, nfIds: nfIds.get(c.slug) } : c));
    const result = (kind, pick, ranked = [], meta = null) => ({
      kind,
      pick: simplify(pick),
      candidates: ranked.slice(0, 6).map(simplify),
      meta,
    });

    // 1) Quick try with the title as shown on Netflix (usually enough for English profiles).
    if (nfTitle) {
      addAll(await searchFilms(nfTitle));
      const exact = rankCandidates([...pool.values()], [nfTitle], null).filter((c) => c.exact);
      const hit = await verify(exact.slice(0, 3));
      if (hit) return result('verified', hit, exact);
    }

    // 2) English title, year and show/film from Netflix's public page.
    const meta = await netflixMeta(id).catch(() => null);
    const queries = [meta?.title, nfTitle].filter(Boolean);
    if (!queries.length) return result('notfound', null);
    if (meta?.title && normalizeTitle(meta.title) !== normalizeTitle(nfTitle)) addAll(await searchFilms(meta.title));

    let ranked = rankCandidates([...pool.values()], queries, meta?.year);
    // For subtitled names like "Glass Onion: A Knives Out Mystery", also try the part before the colon.
    const prefix = meta?.title?.split(/\s*[:–—]\s*/)[0];
    if (!ranked.some((c) => c.exact) && prefix && prefix !== meta.title && prefix.length > 2) {
      addAll(await searchFilms(prefix));
      queries.push(prefix);
      ranked = rankCandidates([...pool.values()], queries, meta?.year);
    }

    const toCheck = ranked.filter((c) => c.exact || (c.yearDiff ?? 99) <= 1).slice(0, 4);
    const hit = await verify(toCheck);
    if (hit) return result('verified', hit, ranked, meta);

    const decision = decideMatch(withIds(ranked), { netflixId: id, year: meta?.year, isShow: meta?.isShow });
    return result(decision.kind, decision.pick, ranked, meta);
  }

  return { searchFilms, netflixIdsForSlug, netflixMeta, resolve };
}
