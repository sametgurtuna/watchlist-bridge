const LB = 'https://letterboxd.com';
const $ = (s) => document.querySelector(s);
const send = (msg) => chrome.runtime.sendMessage(msg);

const STATUS = {
  queued: ['Queued', 'work'],
  resolving: ['Searching', 'work'],
  ready: ['Adding', 'work'],
  adding: ['Adding', 'work'],
  added: ['Added', 'added'],
  review: ['Review', 'review'],
  notfound: ['Not found', ''],
  skipped: ['Skipped', ''],
  error: ['Error', 'error'],
};
const WORKING = ['queued', 'resolving', 'ready', 'adding'];
const MATCH = { verified: 'verified by Netflix link', likely: 'title + year match', manual: 'picked by you' };

let data = null;
let dirty = false;

function el(tag, props = {}, ...children) {
  const n = Object.assign(document.createElement(tag), props);
  for (const c of children) if (c != null && c !== false) n.append(c);
  return n;
}

function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

const nameOf = (it) => it.title || it.nfTitle || `Netflix #${it.id}`;
const lbLink = (it) =>
  el('a', { href: `${LB}/film/${it.slug}/`, target: '_blank', textContent: `${it.lbName || it.slug}${it.lbYear ? ` (${it.lbYear})` : ''}` });

function manualInput(it) {
  const input = el('input', { type: 'text', placeholder: 'Paste a Letterboxd film link, press Enter' });
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !input.value.trim()) return;
    const r = await send({ type: 'popup:choose', id: it.id, slug: input.value });
    if (!r?.ok) {
      input.value = '';
      input.placeholder = r?.error || "That didn't work, try again";
    }
  });
  return input;
}

function row(it) {
  const node = $('#row').content.firstElementChild.cloneNode(true);
  const [label, cls] = STATUS[it.status] || [it.status, ''];
  const title = node.querySelector('.row-title');
  const sub = node.querySelector('.row-sub');
  const actions = node.querySelector('.row-actions');
  const chip = node.querySelector('.chip');

  title.append(nameOf(it), it.year ? el('span', { className: 'year', textContent: ` ${it.year}` }) : '');
  title.title = it.nfTitle && it.nfTitle !== it.title ? `Title on Netflix: ${it.nfTitle}` : nameOf(it);
  chip.textContent = it.isShow && it.status === 'notfound' ? 'TV show' : label;
  chip.className = `chip ${cls}`;

  const btn = (text, onClick, extra = '') => {
    const b = el('button', { type: 'button', className: `btn ${extra}`, textContent: text });
    b.addEventListener('click', onClick);
    return b;
  };
  const skip = () => btn('Skip', () => send({ type: 'popup:skip', id: it.id }));

  if (it.slug && ['added', 'ready', 'adding'].includes(it.status)) {
    sub.append(lbLink(it));
    if (MATCH[it.match]) sub.title = MATCH[it.match];
  } else if (it.status === 'review') {
    sub.textContent = it.isShow
      ? 'Looks like a TV show, Letterboxd may not list it.'
      : MATCH[it.match]
        ? `Confirm to add (${MATCH[it.match]}):`
        : 'Not sure which film this is. Pick one:';
    const select = el('select');
    for (const c of it.candidates || []) {
      const dir = c.directors?.length ? ` · ${c.directors.slice(0, 2).join(', ')}` : '';
      select.append(el('option', { value: c.slug, textContent: `${c.name}${c.year ? ` (${c.year})` : ''}${dir}`, selected: c.slug === it.slug }));
    }
    if (select.options.length) {
      actions.append(select, btn('Add', () => send({ type: 'popup:choose', id: it.id, slug: select.value }), 'go'));
    }
    actions.append(skip(), manualInput(it));
  } else if (it.status === 'notfound') {
    sub.textContent = it.isShow ? "Letterboxd doesn't list TV shows" : 'Not found on Letterboxd';
    if (!it.isShow) {
      const open = el('button', { type: 'button', className: 'link', textContent: 'Match manually' });
      open.addEventListener('click', () => {
        open.remove();
        actions.append(manualInput(it), skip());
        actions.querySelector('input').focus();
      });
      sub.append(' · ', open);
    }
  } else if (it.status === 'error') {
    sub.append(el('span', { className: 'err', textContent: it.error || 'Unknown error' }));
    actions.append(btn('Retry', () => send({ type: 'popup:retry', id: it.id })), skip());
  } else if (it.title && it.nfTitle && it.nfTitle !== it.title) {
    sub.textContent = `On Netflix: ${it.nfTitle}`;
  }
  return node;
}

function render() {
  if (!data) return;
  const items = data.items;
  const count = (f) => items.filter(f).length;
  $('#n-added').textContent = count((i) => i.status === 'added');
  $('#n-queue').textContent = count((i) => WORKING.includes(i.status));
  const nReview = count((i) => i.status === 'review' || i.status === 'error');
  $('#n-review').textContent = nReview;
  $('#n-review').classList.toggle('hot', nReview > 0);
  $('#busy').hidden = !data.busy && !items.some((i) => WORKING.includes(i.status));

  if (data.lastScan) {
    const s = data.lastScan;
    $('#last-scan').textContent = `Last scan ${ago(s.at)}: ${s.total} titles, ${s.fresh} new.`;
  }

  const review = items.filter((i) => i.status === 'review').sort((a, b) => b.updatedAt - a.updatedAt);
  $('#review-section').hidden = !review.length;
  $('#review').replaceChildren(...review.map(row));

  const recent = items
    .filter((i) => i.status !== 'review')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 60);
  $('#recent-section').hidden = !recent.length;
  $('#recent').replaceChildren(...recent.map(row));
  $('#retry-all').hidden = !items.some((i) => i.status === 'error');

  for (const box of document.querySelectorAll('.settings [data-key]')) box.checked = !!data.settings[box.dataset.key];
  for (const r of document.querySelectorAll('.settings [name="openMode"]')) r.checked = r.value === data.settings.openMode;
}

async function load() {
  data = await send({ type: 'popup:state' });
  render();
}

// Don't redraw while the user is in a picker or text field; redraw once focus leaves.
function refresh() {
  const a = document.activeElement;
  if (a && a.closest?.('.row-actions')) {
    dirty = true;
    return;
  }
  load();
}
document.addEventListener('focusout', () =>
  setTimeout(() => {
    if (dirty && !document.activeElement?.closest?.('.row-actions')) {
      dirty = false;
      load();
    }
  })
);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.items || changes.settings || changes.lastScan)) refresh();
});

$('#scan').addEventListener('click', async () => {
  await send({ type: 'popup:scan' });
  window.close();
});

$('#retry-all').addEventListener('click', () => send({ type: 'popup:retry' }));

document.querySelector('.settings').addEventListener('change', (e) => {
  const t = e.target;
  const patch = t.name === 'openMode' ? { openMode: t.value } : { [t.dataset.key]: t.checked };
  send({ type: 'popup:settings', settings: patch });
});

load();
