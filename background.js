import { LB, NF, createApi, slugFromLetterboxdUrl } from './lib/core.js';

const api = createApi();

const DEFAULTS = {
  autoAdd: true, // add matched films to the watchlist without asking
  trustLikely: true, // also add exact title + year matches that the Netflix link can't confirm
  openMode: 'watch', // 'watch' = start playing, 'title' = open the Netflix title page
  scanWatchlist: true, // mark films that are on Netflix on Letterboxd watchlist pages
  detectClicks: true, // catch "Add to My List" clicks on Netflix right away
};
const AVAIL_TTL = 3 * 24 * 3600e3;
const AVAIL_MAX = 3000;

// Single in-memory copy, written to storage after every change. The popup only reads it.
let state = null;
const ready = (async () => {
  const s = await chrome.storage.local.get(['items', 'avail', 'settings', 'lastScan']);
  state = {
    items: s.items || {},
    avail: s.avail || {},
    settings: { ...DEFAULTS, ...s.settings },
    lastScan: s.lastScan || null,
  };
  // The service worker may have been stopped mid-task.
  for (const it of Object.values(state.items)) {
    if (it.status === 'resolving') it.status = 'queued';
    if (it.status === 'adding') it.status = 'ready';
  }
  updateBadge();
})();

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.local.set({ items: state.items, avail: state.avail, lastScan: state.lastScan });
    updateBadge();
  }, 150);
}

function updateBadge() {
  const n = Object.values(state.items).filter((i) => i.status === 'review' || i.status === 'error').length;
  chrome.action.setBadgeText({ text: n ? String(n) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#ff4557' });
}

const touch = (it, patch) => Object.assign(it, patch, { updatedAt: Date.now() });
const label = (it) => it.lbName || it.title || it.nfTitle || it.id;

const availCache = {
  get(slug) {
    const e = state.avail[slug];
    return e && Date.now() - e.t < AVAIL_TTL ? e.ids : undefined;
  },
  set(slug, ids) {
    state.avail[slug] = { ids, t: Date.now() };
    const keys = Object.keys(state.avail);
    if (keys.length > AVAIL_MAX) {
      keys.sort((a, b) => state.avail[a].t - state.avail[b].t);
      for (const k of keys.slice(0, keys.length - AVAIL_MAX)) delete state.avail[k];
    }
    save();
  },
};

// ---------- Netflix → queue ----------

const notifyTabs = new Map(); // netflixId → Netflix tab (for toasts)

function upsert({ id, title }, source) {
  id = String(id);
  const it = state.items[id];
  if (it) {
    if (!it.nfTitle && title) it.nfTitle = title;
    return null;
  }
  return (state.items[id] = {
    id,
    nfTitle: title || null,
    title: null,
    year: null,
    isShow: false,
    status: 'queued',
    source,
    firstSeen: Date.now(),
    updatedAt: Date.now(),
  });
}

function notify(it, kind, text) {
  const tabId = notifyTabs.get(it.id);
  if (tabId == null) return;
  notifyTabs.delete(it.id);
  chrome.tabs.sendMessage(tabId, { type: 'nf:toast', kind, text }).catch(() => {});
}

// ---------- Processing loop ----------

let running = null;
const hasWork = () => Object.values(state.items).some((i) => i.status === 'queued' || i.status === 'ready');

function kick() {
  if (!running) {
    running = processQueue().finally(() => {
      running = null;
      closeWorkerTab();
      if (hasWork()) kick();
    });
  }
  return running;
}

async function processQueue() {
  await ready;
  for (;;) {
    // Clicked titles first, then oldest first.
    const next = Object.values(state.items)
      .filter((i) => i.status === 'queued' || i.status === 'ready')
      .sort((a, b) => (b.source === 'click') - (a.source === 'click') || a.firstSeen - b.firstSeen)[0];
    if (!next) return;
    if (next.status === 'queued') await resolveItem(next);
    if (next.status === 'ready') await addItem(next);
  }
}

async function resolveItem(it) {
  touch(it, { status: 'resolving', error: null });
  save();
  try {
    const r = await api.resolve({ id: it.id, nfTitle: it.nfTitle }, { avail: availCache });
    if (r.meta) Object.assign(it, { title: r.meta.title, year: r.meta.year, isShow: r.meta.isShow });
    it.candidates = r.candidates;
    it.match = r.kind;
    if (r.pick) Object.assign(it, { slug: r.pick.slug, lbName: r.pick.name, lbYear: r.pick.year });
    const { autoAdd, trustLikely } = state.settings;
    const confident = r.kind === 'verified' || (r.kind === 'likely' && trustLikely);
    if (confident && autoAdd) touch(it, { status: 'ready' });
    else if (r.kind === 'notfound') {
      touch(it, { status: 'notfound' });
      notify(it, 'warn', `Not found on Letterboxd: ${label(it)}`);
    } else {
      touch(it, { status: 'review' });
      notify(it, 'warn', `Pick the right match for ${label(it)} in the extension menu`);
    }
  } catch (e) {
    touch(it, { status: 'error', error: e.message, retry: 'queued' });
    notify(it, 'err', `Couldn't reach Letterboxd: ${label(it)}`);
  }
  save();
}

async function addItem(it) {
  touch(it, { status: 'adding', error: null });
  save();
  const r = await addToWatchlist(it.slug).catch((e) => ({ ok: false, error: e.message }));
  if (r.ok) {
    touch(it, { status: 'added', addedAt: Date.now() });
    notify(it, 'ok', `Added to your Letterboxd watchlist: ${label(it)}`);
  } else {
    touch(it, { status: 'error', error: r.error || "Couldn't add it", retry: 'ready' });
    notify(it, 'err', `${label(it)}: ${r.error || "couldn't add it"}`);
  }
  save();
}

// ---------- Adding to the Letterboxd watchlist ----------

async function readLbResult(res) {
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (!json) return null;
  if (json.result === false) {
    const msg = [].concat(json.messages || [], json.errorCodes || []).join(' ').replace(/<[^>]+>/g, '');
    return { ok: false, error: msg || 'Letterboxd rejected the request' };
  }
  return { ok: true };
}

// Try a direct request first; if browser cookie rules or an Origin check get in the way,
// do it from inside a Letterboxd tab (same origin).
async function addToWatchlist(slug) {
  const direct = await addDirect(slug).catch(() => null);
  if (direct?.ok) return direct;
  return addViaTab(slug);
}

async function addDirect(slug) {
  const ac = await fetch(`${LB}/s/autocompletefilm?q=a&limit=1`, { credentials: 'include' });
  const { csrf } = await ac.json();
  if (!csrf) return null;
  const res = await fetch(`${LB}/film/${encodeURIComponent(slug)}/add-to-watchlist/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: `__csrf=${encodeURIComponent(csrf)}`,
  });
  return readLbResult(res);
}

// Injected into a Letterboxd tab; it can't see anything outside this function.
async function injectedAddToWatchlist(slug) {
  if (document.body?.classList.contains('logged-out')) {
    return { ok: false, auth: true, error: "You're not signed in to Letterboxd" };
  }
  let csrf = document.querySelector('input[name="__csrf"]')?.value;
  if (!csrf) {
    const ac = await fetch('/s/autocompletefilm?q=a&limit=1').then((r) => r.json()).catch(() => null);
    csrf = ac?.csrf;
  }
  if (!csrf) return { ok: false, error: 'Letterboxd session token not found' };
  const res = await fetch(`/film/${encodeURIComponent(slug)}/add-to-watchlist/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: `__csrf=${encodeURIComponent(csrf)}`,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (json?.result === false) {
    const msg = [].concat(json.messages || [], json.errorCodes || []).join(' ').replace(/<[^>]+>/g, '');
    return { ok: false, error: msg || 'Letterboxd rejected the request' };
  }
  if (/\/sign-in\//.test(res.url)) return { ok: false, auth: true, error: "You're not signed in to Letterboxd" };
  return res.ok ? { ok: true } : { ok: false, error: `Letterboxd HTTP ${res.status}` };
}

let workerTab = null; // background tab we opened ourselves; closed when the queue is done

async function letterboxdTabId() {
  if (workerTab != null) {
    const t = await chrome.tabs.get(workerTab).catch(() => null);
    if (t) return workerTab;
    workerTab = null;
  }
  const tabs = await chrome.tabs.query({ url: `${LB}/*` });
  const open = tabs.find((t) => !t.discarded && t.status === 'complete');
  if (open) return open.id;
  const tab = await chrome.tabs.create({ url: `${LB}/`, active: false });
  workerTab = tab.id;
  await waitForTab(tab.id);
  return tab.id;
}

function waitForTab(tabId, timeout = 20000) {
  return new Promise((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(onUpd);
      clearTimeout(timer);
      resolve();
    };
    const onUpd = (id, info) => id === tabId && info.status === 'complete' && done();
    const timer = setTimeout(done, timeout);
    chrome.tabs.onUpdated.addListener(onUpd);
    chrome.tabs.get(tabId).then((t) => t.status === 'complete' && done(), done);
  });
}

function closeWorkerTab() {
  if (workerTab == null) return;
  chrome.tabs.remove(workerTab).catch(() => {});
  workerTab = null;
}

async function addViaTab(slug) {
  const tabId = await letterboxdTabId();
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: injectedAddToWatchlist,
    args: [slug],
  });
  return res?.result || { ok: false, error: "Couldn't run in the Letterboxd tab" };
}

// ---------- Letterboxd → Netflix ----------

async function lookup(slug, allowFetch) {
  const own = Object.values(state.items).find(
    (i) => i.slug === slug && ['added', 'ready', 'adding'].includes(i.status)
  );
  if (own) return { id: own.id, source: 'list' };
  let ids = availCache.get(slug);
  if (!ids && allowFetch) {
    try {
      ids = await api.netflixIdsForSlug(slug);
      availCache.set(slug, ids);
    } catch {
      return { id: null, known: false };
    }
  }
  return { id: ids?.[0] ?? null, source: ids?.length ? 'availability' : null, known: !!ids };
}

// ---------- Netflix "My List" scan ----------

async function startMyListScan() {
  const tab = await chrome.tabs.create({ url: `${NF}/browse/my-list`, active: true });
  const { fullScanTabs = [] } = await chrome.storage.session.get('fullScanTabs');
  await chrome.storage.session.set({ fullScanTabs: [...fullScanTabs, tab.id] });
}

async function consumeFullScan(tabId) {
  const { fullScanTabs = [] } = await chrome.storage.session.get('fullScanTabs');
  if (!fullScanTabs.includes(tabId)) return false;
  await chrome.storage.session.set({ fullScanTabs: fullScanTabs.filter((t) => t !== tabId) });
  return true;
}

// ---------- Messages ----------

const handlers = {
  async 'nf:hello'(msg, sender) {
    return { settings: state.settings, fullScan: await consumeFullScan(sender.tab?.id) };
  },

  async 'nf:mylist'({ items, full }) {
    let fresh = 0;
    for (const x of items) if (upsert(x, 'mylist')) fresh++;
    if (full) state.lastScan = { at: Date.now(), total: items.length, fresh };
    save();
    kick();
    return { fresh, total: items.length };
  },

  async 'nf:added'({ item }, sender) {
    const existing = state.items[String(item.id)];
    if (existing) {
      if (existing.status === 'added') return { status: 'already', name: label(existing) };
      if (existing.status === 'review') return { status: 'review', name: label(existing) };
      if (['notfound', 'skipped', 'error'].includes(existing.status)) {
        touch(existing, { status: existing.slug ? 'ready' : 'queued', source: 'click' });
      }
    } else {
      upsert(item, 'click');
    }
    if (sender.tab?.id != null) notifyTabs.set(String(item.id), sender.tab.id);
    save();
    kick();
    return { status: 'queued' };
  },

  async 'lb:lookup'({ slug, fetch }) {
    return lookup(slug, fetch);
  },

  async 'popup:state'() {
    return { items: Object.values(state.items), settings: state.settings, lastScan: state.lastScan, busy: !!running };
  },

  async 'popup:scan'() {
    await startMyListScan();
    return { ok: true };
  },

  async 'popup:choose'({ id, slug: input }) {
    const it = state.items[id];
    const slug = slugFromLetterboxdUrl(input);
    if (!it || !slug) return { ok: false, error: "That isn't a Letterboxd film link" };
    const c = it.candidates?.find((x) => x.slug === slug);
    touch(it, { slug, lbName: c?.name || slug, lbYear: c?.year ?? null, match: 'manual', status: 'ready' });
    save();
    kick();
    return { ok: true };
  },

  async 'popup:skip'({ id }) {
    const it = state.items[id];
    if (it) touch(it, { status: 'skipped' });
    save();
    return { ok: true };
  },

  async 'popup:retry'({ id }) {
    const list = id ? [state.items[id]] : Object.values(state.items).filter((i) => i.status === 'error');
    for (const it of list.filter(Boolean)) touch(it, { status: it.retry || (it.slug ? 'ready' : 'queued') });
    save();
    kick();
    return { ok: true };
  },

  async 'popup:settings'({ settings }) {
    state.settings = { ...state.settings, ...settings };
    await chrome.storage.local.set({ settings: state.settings });
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const h = handlers[msg?.type];
  if (!h) return false;
  ready
    .then(() => h(msg, sender))
    .then(sendResponse, (e) => sendResponse({ ok: false, error: e.message }));
  return true;
});

// Pick up unfinished work after the service worker restarts.
chrome.alarms.create('lbnf-resume', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener((a) => a.name === 'lbnf-resume' && ready.then(kick));
chrome.runtime.onStartup.addListener(() => ready.then(kick));
chrome.runtime.onInstalled.addListener(() => ready.then(kick));
ready.then(() => hasWork() && kick());
