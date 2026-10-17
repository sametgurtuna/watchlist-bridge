// End-to-end run of background.js against a fake chrome API and a fake network.
// Run: node tests/background.test.mjs
import assert from 'node:assert/strict';

// ---------- fake network ----------

// Netflix often shows localized titles ('İrlandalı' is The Irishman on Netflix Turkey).
const SEARCH = {
  'İrlandalı': [],
  'The Irishman': [
    { slug: 'the-irishman-2019', name: 'The Irishman', releaseYear: 2019 },
    { slug: 'the-irishman', name: 'The Irishman', releaseYear: 1983 },
  ],
  'Stranger Things': [{ slug: 'stranger-things', name: 'Stranger Things', releaseYear: 2010 }],
  'Film Ambigu': [],
  Ambiguous: [
    { slug: 'ambiguous-a', name: 'Ambiguous', releaseYear: 2020 },
    { slug: 'ambiguous-b', name: 'Ambiguous', releaseYear: 2020 },
  ],
};
const AVAIL = { 'the-irishman-2019': '80175798', 'red-notice': '81161626' };
const NETFLIX = {
  80175798: ['The Irishman', 2019, ''],
  80057281: ['Stranger Things', 2025, '<li>5 Seasons</li>'],
  555: ['Ambiguous', 2020, ''],
};
const net = { posts: [], postReply: () => ({ result: true }) };

function respond(body, { url, type = 'text/html', status = 200 } = {}) {
  const res = new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': type },
  });
  Object.defineProperty(res, 'url', { value: url });
  return res;
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  if (url.host === 'letterboxd.com') {
    if (url.pathname === '/s/autocompletefilm') {
      const data = (SEARCH[url.searchParams.get('q')] || []).map((d) => ({ ...d, type: 'film' }));
      return respond({ result: true, csrf: 'tok', data }, { url: url.href, type: 'application/json' });
    }
    const avail = url.pathname.match(/^\/csi\/film\/([^/]+)\/availability\/$/);
    if (avail) {
      const id = AVAIL[avail[1]];
      const html = id ? `<a href="https://click.justwatch.com/a?r=https%3A%2F%2Fwww.netflix.com%2Ftitle%2F${id}">` : '<p>none</p>';
      return respond(html, { url: url.href });
    }
    const add = url.pathname.match(/^\/film\/([^/]+)\/add-to-watchlist\/$/);
    if (add && init.method === 'POST') {
      net.posts.push({ slug: add[1], body: init.body });
      const reply = net.postReply(add[1]);
      return typeof reply === 'string' ? respond(reply, { url: url.href }) : respond(reply, { url: url.href, type: 'application/json' });
    }
  }
  if (url.host === 'www.netflix.com') {
    const id = url.pathname.match(/\/title\/(\d+)/)?.[1];
    const m = NETFLIX[id];
    if (!m) return respond('<h1>Netflix</h1>', { url: 'https://www.netflix.com/tr-en/' });
    return respond(`<h1>${m[0]}</h1><div data-uia="metadata"><ul><li>${m[1]}</li>${m[2]}</ul></div>`, { url: url.href });
  }
  throw new Error(`unexpected request: ${url}`);
};

// ---------- fake chrome ----------

const local = {};
const session = {};
let onMessage = null;
const tabs = { created: [], removed: [], sent: [], open: [] };
const scripting = { calls: [], reply: { ok: true } };
const noopEvent = { addListener() {} };

globalThis.chrome = {
  storage: {
    local: {
      get: async (keys) => Object.fromEntries([].concat(keys).filter((k) => k in local).map((k) => [k, structuredClone(local[k])])),
      set: async (obj) => Object.assign(local, structuredClone(obj)),
    },
    session: {
      get: async (k) => (k in session ? { [k]: session[k] } : {}),
      set: async (obj) => Object.assign(session, obj),
    },
    onChanged: noopEvent,
  },
  action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
  runtime: { onMessage: { addListener: (fn) => (onMessage = fn) }, onStartup: noopEvent, onInstalled: noopEvent },
  alarms: { create() {}, onAlarm: noopEvent },
  tabs: {
    query: async () => tabs.open,
    create: async (opts) => {
      const tab = { id: 100 + tabs.created.length, status: 'complete', ...opts };
      tabs.created.push(tab);
      return tab;
    },
    get: async (id) => {
      const t = tabs.created.find((x) => x.id === id && !tabs.removed.includes(id));
      if (!t) throw new Error('no such tab');
      return t;
    },
    remove: async (id) => tabs.removed.push(id),
    sendMessage: async (id, msg) => tabs.sent.push({ id, msg }),
    onUpdated: { addListener() {}, removeListener() {} },
  },
  scripting: {
    executeScript: async ({ target, args }) => {
      scripting.calls.push({ tabId: target.tabId, args });
      return [{ result: scripting.reply }];
    },
  },
};

await import('../background.js');

const send = (msg, sender = { tab: { id: 7 } }) => new Promise((resolve) => onMessage(msg, sender, resolve));
const items = async () => (await send({ type: 'popup:state' })).items;
const byId = async (id) => (await items()).find((i) => i.id === id);
async function idle() {
  for (let i = 0; i < 200; i++) {
    const s = await send({ type: 'popup:state' });
    if (!s.busy && !s.items.some((x) => ['queued', 'resolving', 'ready', 'adding'].includes(x.status))) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('queue did not finish');
}

let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log('  ✓', name);
  } catch (e) {
    failed++;
    console.log('  ✗', name, '\n   ', e.stack);
  }
}

console.log('background flow');

await test('My List scan: verified film is added, TV show is not found, ambiguous one goes to review', async () => {
  const r = await send({
    type: 'nf:mylist',
    full: true,
    items: [
      { id: '80175798', title: 'İrlandalı' },
      { id: '80057281', title: 'Stranger Things' },
      { id: '555', title: 'Film Ambigu' },
    ],
  });
  assert.deepEqual(r, { fresh: 3, total: 3 });
  await idle();
  const irish = await byId('80175798');
  assert.equal(irish.status, 'added');
  assert.equal(irish.slug, 'the-irishman-2019');
  assert.equal(irish.match, 'verified');
  assert.equal((await byId('80057281')).status, 'notfound');
  const amb = await byId('555');
  assert.equal(amb.status, 'review');
  assert.equal(amb.candidates.length, 2);
  assert.deepEqual(net.posts, [{ slug: 'the-irishman-2019', body: '__csrf=tok' }]);
  assert.equal(tabs.created.length, 0, 'no tab should open when the direct request works');
});

await test('scanning the same list again adds nothing new', async () => {
  const r = await send({ type: 'nf:mylist', full: true, items: [{ id: '80175798', title: 'İrlandalı' }] });
  assert.equal(r.fresh, 0);
  assert.equal(net.posts.length, 1);
});

await test('user pick gets added; falls back to a Letterboxd tab when the direct request returns no JSON', async () => {
  net.postReply = () => '<html>sign in</html>';
  const r = await send({ type: 'popup:choose', id: '555', slug: 'https://letterboxd.com/film/ambiguous-b/' });
  assert.equal(r.ok, true);
  await idle();
  const amb = await byId('555');
  assert.equal(amb.status, 'added');
  assert.equal(amb.match, 'manual');
  assert.equal(scripting.calls.length, 1);
  assert.deepEqual(scripting.calls[0].args, ['ambiguous-b']);
  assert.equal(tabs.created.length, 1, 'a background Letterboxd tab should open');
  assert.equal(tabs.created[0].active, false);
  assert.deepEqual(tabs.removed, [tabs.created[0].id], 'the tab should close when the queue is done');
});

await test('signed out of Letterboxd gives an error; retry fixes it once signed in', async () => {
  net.postReply = () => ({ result: false, messages: ['You must be signed in'] });
  scripting.reply = { ok: false, auth: true, error: "You're not signed in to Letterboxd" };
  SEARCH['Red Notice'] = [{ slug: 'red-notice', name: 'Red Notice', releaseYear: 2021 }];
  await send({ type: 'nf:added', item: { id: '81161626', title: 'Red Notice' } });
  await idle();
  let it = await byId('81161626');
  assert.equal(it.status, 'error');
  assert.match(it.error, /signed in/);
  assert.ok(tabs.sent.some((t) => t.id === 7 && t.msg.kind === 'err'), 'the Netflix tab should get an error toast');

  net.postReply = () => ({ result: true });
  await send({ type: 'popup:retry', id: '81161626' });
  await idle();
  it = await byId('81161626');
  assert.equal(it.status, 'added');
});

await test('adding the same title on Netflix again reports it as already added', async () => {
  const r = await send({ type: 'nf:added', item: { id: '80175798', title: 'İrlandalı' } });
  assert.equal(r.status, 'already');
});

await test('Letterboxd → Netflix lookup: our own list first, then "Where to watch"', async () => {
  assert.deepEqual(await send({ type: 'lb:lookup', slug: 'the-irishman-2019', fetch: false }), { id: '80175798', source: 'list' });
  const before = await send({ type: 'lb:lookup', slug: 'some-film', fetch: false });
  assert.equal(before.known, false);
  const none = await send({ type: 'lb:lookup', slug: 'some-film', fetch: true });
  assert.deepEqual(none, { id: null, source: null, known: true });
});

await test('skip and settings', async () => {
  await send({ type: 'popup:skip', id: '80057281' });
  assert.equal((await byId('80057281')).status, 'skipped');
  await send({ type: 'popup:settings', settings: { openMode: 'title' } });
  assert.equal((await send({ type: 'popup:state' })).settings.openMode, 'title');
  assert.equal(local.settings.openMode, 'title');
});

await test('with autoAdd off, even a verified match waits for confirmation', async () => {
  await send({ type: 'popup:settings', settings: { autoAdd: false } });
  NETFLIX[777] = ['The Irishman', 2019, ''];
  AVAIL['the-irishman'] = '777';
  await send({ type: 'nf:mylist', full: false, items: [{ id: '777', title: 'The Irishman' }] });
  await idle();
  const it = await byId('777');
  assert.equal(it.status, 'review');
  assert.equal(it.slug, 'the-irishman');
  assert.equal(it.match, 'verified');
});

// Saving is debounced by 150 ms; check it reached storage too.
await new Promise((r) => setTimeout(r, 300));
await test('state is written to storage', async () => {
  assert.equal(local.items['80175798'].status, 'added');
  assert.ok(local.avail['the-irishman-2019']);
});

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
process.exit(0);
