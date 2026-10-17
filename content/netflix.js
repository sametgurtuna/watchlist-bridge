// Netflix side: reads the "My List" page and catches "Add to My List" clicks.
// Netflix changes its markup often, so title IDs are looked up in several ways.
(() => {
  if (window.__lbnfNetflix) return;
  window.__lbnfNetflix = true;

  const ID_RE = /\/(?:watch|title)\/(\d+)|[?&]jbv=(\d+)/;
  // data-uia is language-independent; the aria-label fallbacks cover common Netflix UI languages.
  const MYLIST_RE = /my-?list|my list|listem|meine liste|ma liste|mi lista|minha lista|la mia lista|mijn lijst|moja lista/;
  const REMOVE_RE = /remove|kald[ıi]r|[çc][ıi]kar|entfernen|retirer|supprimer|quitar|eliminar|remover|rimuovi|verwijder|usuń/;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);
  let settings = { detectClicks: true };

  // ---------- toast ----------

  const MARK = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4557"/><stop offset="1" stop-color="#ffa53d"/></linearGradient></defs>
    <path d="M6 2.5h12a1.5 1.5 0 0 1 1.5 1.5v17.5L12 17l-7.5 4.5V4A1.5 1.5 0 0 1 6 2.5z" fill="url(#g)"/>
    <path d="M10 7.2v6.6l5.4-3.3z" fill="#fff"/></svg>`;

  let toastRoot = null;
  function toast(text, kind = 'info', ms = 4500) {
    if (!toastRoot) {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:24px;bottom:24px;z-index:2147483647;';
      toastRoot = host.attachShadow({ mode: 'open' });
      toastRoot.innerHTML = `<style>
        .t{display:flex;align-items:center;gap:10px;margin-top:8px;max-width:440px;padding:12px 16px;
           border-radius:8px;background:#161b22;color:#fff;font:500 14px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;
           box-shadow:0 8px 30px rgba(0,0,0,.5);border-left:4px solid #40bcf4;animation:in .2s ease-out}
        .ok{border-color:#2ed47a}.warn{border-color:#ffa53d}.err{border-color:#ff4557}
        svg{flex:none}
        @keyframes in{from{transform:translateY(8px);opacity:0}}
      </style>`;
      document.documentElement.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `t ${kind}`;
    el.innerHTML = `${MARK}<span></span>`;
    el.lastChild.textContent = text;
    toastRoot.appendChild(el);
    setTimeout(() => el.remove(), ms);
    return el;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'nf:toast') toast(msg.text, msg.kind);
  });

  // ---------- finding title IDs ----------

  const idFromHref = (href) => {
    const m = href?.match(ID_RE);
    return m ? m[1] || m[2] : null;
  };

  function idFromTracking(el) {
    const raw = el.getAttribute('data-ui-tracking-context');
    if (!raw) return null;
    try {
      const j = JSON.parse(decodeURIComponent(raw));
      return j.video_id ? String(j.video_id) : null;
    } catch {
      return null;
    }
  }

  function titleOf(el) {
    if (!el) return null;
    const v =
      el.getAttribute?.('aria-label') ||
      el.querySelector?.('.fallback-text')?.textContent ||
      el.querySelector?.('img[alt]:not([alt=""])')?.alt;
    return v ? v.replace(/\s+/g, ' ').trim() || null : null;
  }

  const CARD = '.title-card, .title-card-container, .slider-item, .titleCard--container, [class*="titleCard"]';
  const SKIP = '.billboard-row, .billboard, [data-uia="billboard"], header, footer, nav';

  function infoFrom(root) {
    if (!root) return null;
    const anchors = root.matches?.('a[href]') ? [root] : root.querySelectorAll('a[href]');
    for (const a of anchors) {
      const id = idFromHref(a.getAttribute('href'));
      if (id) return { id, title: titleOf(a) || titleOf(a.closest(CARD)) };
    }
    const trackers = root.matches?.('[data-ui-tracking-context]') ? [root] : root.querySelectorAll('[data-ui-tracking-context]');
    for (const el of trackers) {
      const id = idFromTracking(el);
      if (id) return { id, title: titleOf(el.closest(CARD) || el) };
    }
    return null;
  }

  function collectMyList() {
    const root = document.querySelector('.mainView, [data-uia="main-view"], main') || document.body;
    const found = new Map();
    for (const a of root.querySelectorAll('a[href*="/watch/"], a[href*="/title/"], a[href*="jbv="]')) {
      if (a.closest(SKIP)) continue;
      const id = idFromHref(a.getAttribute('href'));
      if (!id || found.has(id)) continue;
      found.set(id, { id, title: titleOf(a) || titleOf(a.closest(CARD)) });
    }
    for (const el of root.querySelectorAll('[data-ui-tracking-context]')) {
      if (el.closest(SKIP)) continue;
      const id = idFromTracking(el);
      if (!id || found.has(id)) continue;
      found.set(id, { id, title: titleOf(el.closest(CARD) || el) });
    }
    return [...found.values()];
  }

  // ---------- "My List" page ----------

  const reported = new Set();
  let scanning = false;
  let passiveObserver = null;

  async function report(items, full) {
    const fresh = items.filter((x) => !reported.has(x.id));
    if (!full && !fresh.length) return null;
    items.forEach((x) => reported.add(x.id));
    return send({ type: 'nf:mylist', items: full ? items : fresh, full });
  }

  async function waitForCards(timeout) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (collectMyList().length) return true;
      await sleep(500);
    }
    return false;
  }

  async function scanMyList(full) {
    if (scanning) return;
    scanning = true;
    const status = full ? toast('Watchlist Bridge: scanning My List…', 'info', 120000) : null;
    try {
      // Give the user time if the profile picker shows up first.
      const found = await waitForCards(full ? 90000 : 15000);
      if (!found) {
        status?.remove();
        if (full) toast('My List looks empty, or Netflix changed its page layout.', 'warn', 8000);
        return;
      }
      if (full) {
        // The list loads lazily: keep scrolling until the count stops changing.
        let last = -1;
        let stable = 0;
        for (let i = 0; i < 80 && stable < 3; i++) {
          window.scrollTo(0, document.documentElement.scrollHeight);
          await sleep(900);
          const n = collectMyList().length;
          stable = n === last ? stable + 1 : 0;
          last = n;
          status.lastChild.textContent = `Watchlist Bridge: scanning My List… ${n} titles`;
        }
        window.scrollTo(0, 0);
      }
      const items = collectMyList();
      const res = await report(items, full);
      status?.remove();
      if (full) {
        const fresh = res?.fresh ?? 0;
        toast(
          fresh
            ? `Found ${items.length} titles. Sending ${fresh} new ones to Letterboxd — track progress in the extension menu.`
            : `Found ${items.length} titles, all already synced.`,
          'ok',
          9000
        );
      }
      watchPassively();
    } finally {
      scanning = false;
    }
  }

  // While the user browses My List, report cards as they load in.
  function watchPassively() {
    passiveObserver?.disconnect();
    let t = null;
    passiveObserver = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (!isMyList()) return passiveObserver?.disconnect();
        report(collectMyList(), false);
      }, 1200);
    });
    passiveObserver.observe(document.body, { childList: true, subtree: true });
  }

  const isMyList = () => /^\/browse\/my-list/.test(location.pathname);

  // ---------- "Add to My List" clicks ----------

  let lastHover = null;
  document.addEventListener(
    'mouseover',
    (e) => {
      const card = e.target.closest?.(CARD);
      const info = card && infoFrom(card);
      if (info) lastHover = { ...info, t: Date.now() };
    },
    true
  );

  function infoForButton(btn) {
    // 1) The button's own card (including "More like this" cards inside the detail view)
    const own = infoFrom(btn.closest(CARD));
    if (own) return own;
    // 2) Preview or detail modal
    const modal = btn.closest('.previewModal--wrapper, .previewModal--container, [class*="previewModal"], [role="dialog"], .jawBoneContainer');
    const jbv = new URLSearchParams(location.search).get('jbv');
    if (modal && jbv && modal.closest('.detail-modal, [class*="detail-modal"], [data-uia*="DETAIL_MODAL"]')) {
      return { id: jbv, title: titleOf(modal.querySelector('[class*="titleTreatment"] img, img[class*="title"]')) };
    }
    const inModal = infoFrom(modal);
    if (inModal) return inModal;
    if (jbv) return { id: jbv, title: null };
    // 3) The card the mouse was last over (the small preview opens in a separate layer)
    if (lastHover && Date.now() - lastHover.t < 15000) return { id: lastHover.id, title: lastHover.title };
    // 4) Player page
    const watching = location.pathname.match(/^\/watch\/(\d+)/)?.[1];
    return watching ? { id: watching, title: null } : null;
  }

  document.addEventListener(
    'click',
    (e) => {
      if (!settings.detectClicks) return;
      const btn = e.target.closest?.('button, [role="button"]');
      if (!btn) return;
      const text = [btn.getAttribute('data-uia'), btn.getAttribute('aria-label'), btn.title].join(' ').toLowerCase();
      if (!MYLIST_RE.test(text)) return;
      // The label at click time reflects the current state: "remove" means it's being taken off the list.
      if (REMOVE_RE.test(text)) return;
      const info = infoForButton(btn);
      if (!info?.id) return;
      send({ type: 'nf:added', item: info }).then((res) => {
        const name = info.title || res?.name || 'This title';
        if (res?.status === 'already') toast(`${name} is already on your Letterboxd watchlist.`, 'ok');
        else if (res?.status === 'review') toast(`${name}: pick the right match in the extension menu.`, 'warn');
        else if (res?.status === 'queued') toast(`Sending ${name} to Letterboxd…`, 'info', 3000);
      });
    },
    true
  );

  // ---------- follow SPA navigation ----------

  let lastPath = null;
  let pendingFull = false;

  async function onRoute() {
    if (isMyList()) {
      scanMyList(pendingFull);
      pendingFull = false;
    } else {
      passiveObserver?.disconnect();
    }
  }

  (async () => {
    const hello = await send({ type: 'nf:hello' });
    if (hello?.settings) settings = hello.settings;
    pendingFull = !!hello?.fullScan;
    setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        onRoute();
      }
    }, 800);
  })();

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings?.newValue) settings = changes.settings.newValue;
  });
})();
