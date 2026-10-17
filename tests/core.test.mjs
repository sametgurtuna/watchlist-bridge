// Run: node tests/core.test.mjs
import assert from 'node:assert/strict';
import {
  normalizeTitle,
  parseNetflixTitlePage,
  netflixIdsFromAvailability,
  slugFromLetterboxdUrl,
  rankCandidates,
  decideMatch,
} from '../lib/core.js';

let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log('  ✓', name);
  } catch (e) {
    failed++;
    console.log('  ✗', name, '\n   ', e.message);
  }
}

console.log('matching');

await test('normalizeTitle', () => {
  assert.equal(normalizeTitle('The Irishman'), 'irishman');
  assert.equal(normalizeTitle('İrlandalı'), 'irlandali'); // Turkish dotted/dotless i
  assert.equal(normalizeTitle("Ocean's Eleven"), 'oceans eleven');
  assert.equal(normalizeTitle('Amélie'), 'amelie');
  assert.equal(normalizeTitle('Fast & Furious'), 'fast and furious');
});

await test('parseNetflixTitlePage', () => {
  const html = `<html><h1>The Irishman</h1><div data-uia="metadata"><ul><li class="x">2019</li><li>⁨16+⁩</li><li>Drama</li></ul></div>`;
  assert.deepEqual(parseNetflixTitlePage(html), { title: 'The Irishman', year: 2019, isShow: false });
  const show = `<h1>Stranger Things</h1><div data-uia="metadata"><ul><li>2025</li><li>5 Seasons</li></ul></div>`;
  assert.equal(parseNetflixTitlePage(show).isShow, true);
});

await test('netflixIdsFromAvailability', () => {
  const html = `<a href="https://click.justwatch.com/a?cx=x&amp;r=https%3A%2F%2Fwww.netflix.com%2Ftitle%2F80175798&amp;uct_country=tr">
    <a href="https://www.netflix.com/watch/81161626">`;
  assert.deepEqual(netflixIdsFromAvailability(html), ['80175798', '81161626']);
  assert.deepEqual(netflixIdsFromAvailability('<p>amazon</p>'), []);
});

await test('slugFromLetterboxdUrl', () => {
  assert.equal(slugFromLetterboxdUrl('https://letterboxd.com/film/the-irishman-2019/'), 'the-irishman-2019');
  assert.equal(slugFromLetterboxdUrl('letterboxd.com/dave/film/roma-2018/'), 'roma-2018');
  assert.equal(slugFromLetterboxdUrl('red-notice'), 'red-notice');
  assert.equal(slugFromLetterboxdUrl('https://example.com/x'), null);
});

await test('decideMatch: a TV show is never "likely", and an old film with the same name is not suggested', () => {
  const ranked = rankCandidates([{ slug: 'stranger-things', name: 'Stranger Things', year: 2010 }], ['Stranger Things'], 2025);
  assert.equal(decideMatch(ranked, { netflixId: '80057281', year: 2025, isShow: true }).kind, 'notfound');
  const mini = rankCandidates([{ slug: 'chernobyl-2019', name: 'Chernobyl', year: 2019 }], ['Chernobyl'], 2019);
  assert.equal(decideMatch(mini, { netflixId: '1', year: 2019, isShow: true }).kind, 'review');
});

await test('decideMatch: a candidate tied to a different Netflix ID is dropped', () => {
  const ranked = rankCandidates([{ slug: 'x-2020', name: 'X', year: 2020, nfIds: ['111'] }], ['X'], 2020);
  assert.equal(decideMatch(ranked, { netflixId: '222', year: 2020, isShow: false }).kind, 'review');
  const ok = rankCandidates([{ slug: 'x-2020', name: 'X', year: 2020 }], ['X'], 2020);
  assert.equal(decideMatch(ok, { netflixId: '222', year: 2020, isShow: false }).kind, 'likely');
});

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
