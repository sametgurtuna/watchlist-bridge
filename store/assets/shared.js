// Fills [data-poster] / [data-card] elements with invented poster art.
// data-poster="Title|kicker|palette|motif"
const PALETTES = [
  ['#1d2b4f', '#f2a541', '#0e1730'], // 0 navy / gold
  ['#4a1222', '#ff7a6b', '#1f070e'], // 1 wine / coral
  ['#0f3f3c', '#a6ebd2', '#06201f'], // 2 teal / mint
  ['#2f2148', '#f2c1ff', '#140d22'], // 3 violet / lilac
  ['#4a3a1c', '#f7e2ae', '#211a0c'], // 4 umber / sand
  ['#13283c', '#86cdfb', '#08131e'], // 5 night / sky
  ['#2b2b2e', '#ff5a4e', '#121214'], // 6 graphite / red
  ['#1e3d2a', '#d8f5a2', '#0b1d12'], // 7 forest / lime
  ['#3d1d12', '#ffb37a', '#1c0c07'], // 8 rust / peach
  ['#202a52', '#ff8fb1', '#0e1430'], // 9 indigo / pink
];

const PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>';
const MARK_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
  <defs><linearGradient id="mk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4557"/><stop offset="1" stop-color="#ffa53d"/></linearGradient></defs>
  <path d="M6 2.5h12a1.5 1.5 0 0 1 1.5 1.5v17.5L12 17l-7.5 4.5V4A1.5 1.5 0 0 1 6 2.5z" fill="url(#mk)"/>
  <path d="M10 7.2v6.6l5.4-3.3z" fill="#fff"/></svg>`;
const CURSOR_SVG = `<svg class="cursor" viewBox="0 0 24 24"><path d="M4 2l15 11-6.6.9 3.8 7.4-2.9 1.4-3.7-7.5L4 20z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>`;

function art(el, kind) {
  const [title, kicker, p, m] = el.getAttribute(`data-${kind}`).split('|');
  const [a, b, c] = PALETTES[+p % PALETTES.length];
  el.classList.add(kind === 'poster' ? 'poster' : 'card', `m${m}`);
  el.style.setProperty('--a', a);
  el.style.setProperty('--b', b);
  el.style.setProperty('--c', c);
  el.insertAdjacentHTML(
    'afterbegin',
    `<div class="art"></div><div class="shade"></div>${kicker ? `<div class="pkick">${kicker}</div>` : ''}<div class="ptitle">${title}</div>`
  );
}

document.querySelectorAll('[data-poster]').forEach((el) => art(el, 'poster'));
document.querySelectorAll('[data-card]').forEach((el) => art(el, 'card'));
document.querySelectorAll('[data-play]').forEach((el) => (el.innerHTML = PLAY_SVG + el.innerHTML));
document.querySelectorAll('[data-mark]').forEach((el) => (el.innerHTML = MARK_SVG + el.innerHTML));
document.querySelectorAll('[data-cursor]').forEach((el) => {
  el.insertAdjacentHTML('afterend', CURSOR_SVG);
  const c = el.nextElementSibling;
  const [x, y] = el.getAttribute('data-cursor').split(',');
  c.style.left = `${x}px`;
  c.style.top = `${y}px`;
  el.remove();
});
