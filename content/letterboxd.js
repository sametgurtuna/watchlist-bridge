// Letterboxd side: "Watch on Netflix" button on film pages, Netflix badges on posters,
// and a "Netflix only" filter on watchlist pages.
(() => {
  if (window.__lbnfLetterboxd) return;
  window.__lbnfLetterboxd = true;

  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);
  const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>';
  let settings = { openMode: 'watch', scanWatchlist: true };

  const nfHref = (id) => `https://www.netflix.com/${settings.openMode === 'title' ? 'title' : 'watch'}/${id}`;
  const isWatchlist = () => /^\/[^/]+\/watchlist\//.test(location.pathname);

  // ---------- film page ----------

  function netflixIdFromDom() {
    for (const a of document.querySelectorAll('.watch-panel a[href], #watch a[href]')) {
      let href = a.href;
      try {
        href = decodeURIComponent(href);
      } catch {}
      const m = href.match(/netflix\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:title|watch)\/(\d+)/i);
      if (m) return m[1];
    }
    return null;
  }

  function filmTitle() {
    const og = document.querySelector('meta[property="og:title"]')?.content;
    return (og || document.title).replace(/^‎/, '').replace(/\s*\(\d{4}\).*$/, '').trim();
  }

  let film = null; // { slug, id, fromList }

  async function filmPage(slug) {
    let r = await send({ type: 'lb:lookup', slug, fetch: false });
    let id = r?.id || netflixIdFromDom();
    if (!id && !r?.known) {
      r = await send({ type: 'lb:lookup', slug, fetch: true });
      id = r?.id;
    }
    film = { slug, id, fromList: r?.source === 'list' };
    renderFilmCta();
  }

  function renderFilmCta() {
    if (!film) return;
    const box = document.querySelector('.lbnf-cta') || document.createElement('section');
    box.className = 'lbnf-cta';
    if (film.id) {
      box.innerHTML = `
        <a class="lbnf-play" target="_blank" rel="noopener">${PLAY}<span>Watch on Netflix</span></a>
        <p class="lbnf-sub"><a class="lbnf-detail" target="_blank" rel="noopener">Netflix title page</a></p>`;
      box.querySelector('.lbnf-play').href = nfHref(film.id);
      box.querySelector('.lbnf-detail').href = `https://www.netflix.com/title/${film.id}`;
      if (film.fromList) box.querySelector('.lbnf-sub').insertAdjacentHTML('beforeend', '<span>· From your Netflix list</span>');
    } else {
      box.innerHTML = `
        <a class="lbnf-search" target="_blank" rel="noopener">Search on Netflix</a>
        <p class="lbnf-sub"><span>Not in the Netflix catalog for your region</span></p>`;
      box.querySelector('.lbnf-search').href = `https://www.netflix.com/search?q=${encodeURIComponent(filmTitle())}`;
    }
    if (!box.isConnected) place(box);
  }

  function place(box) {
    const tryPlace = () => {
      const panel = document.querySelector('.watch-panel');
      if (!panel) return false;
      panel.before(box);
      // Match the "Where to watch" panel's width (narrow on desktop, wide on mobile).
      const fit = () => (box.style.maxWidth = `${panel.offsetWidth}px`);
      fit();
      new ResizeObserver(fit).observe(panel);
      return true;
    };
    if (tryPlace()) return;
    // "Where to watch" sometimes loads late; wait a bit, then fall back to the sidebar.
    const obs = new MutationObserver(() => tryPlace() && obs.disconnect());
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      obs.disconnect();
      if (box.isConnected) return;
      const side = document.querySelector('aside.sidebar, .col-main, #film-page-wrapper');
      if (side) side.prepend(box);
      else {
        box.classList.add('lbnf-floating');
        document.body.appendChild(box);
      }
    }, 4000);
  }

  // ---------- poster badges ----------

  const POSTER = '[data-item-slug], [data-film-slug]';
  const slugOf = (el) => el.getAttribute('data-item-slug') || el.getAttribute('data-film-slug');
  const known = new Map(); // slug → netflixId | null
  const seen = new WeakSet();
  const stats = { checked: 0, total: 0, onNetflix: 0 };

  function badge(el, id) {
    const host = el.parentElement;
    if (!host || host.querySelector(':scope > .lbnf-badge')) return;
    if (getComputedStyle(host).position === 'static') host.classList.add('lbnf-host');
    const a = document.createElement('a');
    a.className = 'lbnf-badge';
    a.dataset.id = id;
    a.href = nfHref(id);
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = 'Watch on Netflix';
    a.setAttribute('aria-label', 'Watch on Netflix');
    a.innerHTML = PLAY;
    // Don't trigger Letterboxd's own poster click/drag behaviour.
    a.addEventListener('click', (e) => e.stopPropagation(), true);
    host.appendChild(a);
    el.closest('li')?.classList.add('lbnf-has');
  }

  async function scanPosters() {
    const fetchAllowed = settings.scanWatchlist && isWatchlist();
    const bySlug = new Map();
    for (const el of document.querySelectorAll(POSTER)) {
      if (seen.has(el) || el.closest('.lbnf-cta')) continue;
      seen.add(el);
      const slug = slugOf(el);
      if (!slug) continue;
      if (!bySlug.has(slug)) bySlug.set(slug, []);
      bySlug.get(slug).push(el);
    }
    if (!bySlug.size) return;
    stats.total += bySlug.size;
    const queue = [...bySlug.keys()];
    const worker = async () => {
      while (queue.length) {
        const slug = queue.shift();
        let id = known.get(slug);
        if (id === undefined) {
          const r = await send({ type: 'lb:lookup', slug, fetch: fetchAllowed });
          id = r?.id ?? null;
          if (r?.known || r?.id) known.set(slug, id);
        }
        stats.checked++;
        if (id) {
          stats.onNetflix++;
          bySlug.get(slug).forEach((el) => badge(el, id));
        }
        for (const el of bySlug.get(slug)) el.closest('li')?.classList.add('lbnf-scanned');
        renderChip();
      }
    };
    // Cached answers come back instantly; the background worker already throttles network requests.
    await Promise.all([worker(), worker(), worker()]);
  }

  // ---------- watchlist bar ----------

  let chip = null;
  function renderChip() {
    if (!isWatchlist() || !settings.scanWatchlist) return;
    if (!chip) {
      chip = document.createElement('div');
      chip.className = 'lbnf-chip';
      chip.innerHTML = `<span class="lbnf-chip-text"></span><button type="button" class="lbnf-chip-btn"></button>`;
      chip.querySelector('button').addEventListener('click', () => {
        document.body.classList.toggle('lbnf-only');
        renderChip();
      });
      // Under the "X wants to see N films" heading; a fixed corner pill if that isn't there.
      const nav = document.querySelector('#content-nav');
      if (nav) nav.after(chip);
      else {
        chip.classList.add('lbnf-fixed');
        document.body.appendChild(chip);
      }
    }
    const scanning = stats.checked < stats.total;
    const n = stats.onNetflix;
    chip.querySelector('.lbnf-chip-text').innerHTML = scanning
      ? `<i>${PLAY}</i> Checking Netflix… ${stats.checked}/${stats.total}`
      : `<i>${PLAY}</i> <strong>${n}</strong>&nbsp;${n === 1 ? 'film' : 'films'} on this page ${n === 1 ? 'is' : 'are'} on Netflix`;
    const only = document.body.classList.contains('lbnf-only');
    const btn = chip.querySelector('button');
    btn.textContent = only ? 'Show all' : 'Netflix only';
    btn.hidden = !n && !only;
  }

  // ---------- start ----------

  let rescanTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(scanPosters, 600);
  });

  chrome.storage.local.get('settings').then(({ settings: s }) => {
    settings = { ...settings, ...s };
    const filmSlug = location.pathname.match(/^\/film\/([^/]+)\/?$/)?.[1];
    if (filmSlug) filmPage(filmSlug);
    scanPosters();
    observer.observe(document.body, { childList: true, subtree: true });
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (!changes.settings?.newValue) return;
    settings = { ...settings, ...changes.settings.newValue };
    renderFilmCta();
    document.querySelectorAll('.lbnf-badge').forEach((a) => (a.href = nfHref(a.dataset.id)));
  });
})();
