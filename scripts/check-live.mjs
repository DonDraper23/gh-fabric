import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { load } from 'cheerio';
import { live } from './cms.mjs';

const preview = 'https://gh-fabric.sylsinoe23.workers.dev';

async function fetchLive(url, options = {}) {
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
    ...options
  });
  return response;
}

async function manifest(host) {
  const url = new URL('/publication.json', host);
  url.searchParams.set('verify', Date.now());
  const response = await fetchLive(url);
  assert.equal(response.status, 200, url.href);
  return response.json();
}

const expected = process.argv.includes('--built')
  ? JSON.parse(await readFile('dist/publication.json', 'utf8'))
  : await manifest(preview);
let current = await manifest(live);
for (let attempt = 0; current.revision !== expected.revision && attempt < 6; attempt++) {
  await delay(5000);
  current = await manifest(live);
}
assert.equal(current.revision, expected.revision, 'Cloudflare is serving the expected publication');
const paths = new Set(['/', ...current.pages.map(page => page.path)]);
const products = new Set(current.products);
const media = new Set();

for (const path of paths) {
  const url = new URL(path, live);
  const response = await fetchLive(url);
  assert.equal(response.status, 200, path);
  const $ = load(await response.text());
  assert.equal($('link[rel="canonical"]').attr('href'), url.href, path);
  assert.equal($('main h1').length, 1, path);
  assert.equal($('#marketingbar,.wpcom-site-banner').length, 0, path);
  if (products.has(path)) {
    const links = $('main a[href^="https://wa.me/"]').toArray().map(link => new URL($(link).attr('href')));
    assert(links.some(link => link.pathname === '/8613967549919' && link.searchParams.get('text')), path);
  }
  if (path === '/') {
    const cards = new Set($('#fabrics a').toArray().map(link => $(link).attr('href')));
    for (const product of products) assert(cards.has(product), product);
  }
  for (const img of $('main img').toArray()) {
    const image = new URL($(img).attr('src'), live);
    if (image.origin === live) media.add(image.href);
  }
  const shareImage = $('meta[property="og:image"]').attr('content');
  if (shareImage) media.add(new URL(shareImage, live).href);
}
for (const url of media) {
  const response = await fetchLive(url, {method: 'HEAD'});
  assert.equal(response.status, 200, url);
  assert(response.headers.get('content-type')?.startsWith('image/'), url);
}

const primary = [...products][0] || '/';
const shared = new URL(primary, 'https://www.gh-fabric.com');
shared.searchParams.set('utm_source', 'catalogue-check');
const redirect = await fetchLive(shared);
assert.equal(redirect.status, 301);
assert.equal(redirect.headers.get('location'), live + shared.pathname + shared.search);

const receipt = {
  month: new Date().toISOString().slice(0, 7),
  site: live,
  revision: current.revision,
  pages: paths.size,
  products: products.size,
  verifiedImages: media.size
};
console.log(`Verified the live catalogue: ${receipt.pages} pages, ${receipt.products} products and ${receipt.verifiedImages} images.`);
const outputFlag = process.argv.indexOf('--record');
if (outputFlag !== -1) {
  await writeFile(process.argv[outputFlag + 1], JSON.stringify(receipt, null, 2) + '\n');
}
