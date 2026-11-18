import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { setTimeout as delay } from 'node:timers/promises';

export const source = 'https://ghfabriccom.wordpress.com';
export const live = 'https://gh-fabric.com';
export const api = 'https://public-api.wordpress.com/wp/v2/sites/ghfabriccom.wordpress.com';
export const sha = value => createHash('sha256').update(value).digest('hex');

export async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {'User-Agent': 'GH-Fabric publication service (gh-fabric.com)'},
        signal: AbortSignal.timeout(35000)
      });
      if (!response.ok) throw new Error(`${response.status} reading ${new URL(url).pathname}`);
      return response;
    } catch (error) {
      if (attempt === 3) throw error;
      await delay(800 * attempt);
    }
  }
}

export function pagePath(value) {
  const url = new URL(value, source);
  if (![new URL(source).host, new URL(live).host, 'www.gh-fabric.com'].includes(url.hostname)) return null;
  if (/%(?:2f|5c|00)/i.test(url.pathname)) throw new Error('Invalid page path');
  const path = decodeURIComponent(url.pathname);
  if (path.includes('\\') || /[\u0000-\u001f]/.test(path) || path.split('/').includes('..')) throw new Error('Invalid page path');
  return path.replace(/\/+$/, '') + '/';
}

export async function readPages() {
  const fields = 'id,slug,status,link,title,modified_gmt,content,excerpt,featured_media,parent,menu_order';
  const pages = [];
  let totalPages = 1;
  for (let n = 1; n <= totalPages; n++) {
    const url = new URL(`${api}/pages?status=publish&per_page=100&orderby=id&order=asc&page=${n}&_fields=${fields}`);
    if (process.env.GHF_WP_FRESH === '1') url.searchParams.set('ghf_sync', Date.now());
    const response = await get(url);
    const reported = response.headers.get('x-wp-totalpages');
    if (reported === null) throw new Error('WordPress returned an incomplete page index');
    totalPages = Number(reported);
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error('Unexpected WordPress page response');
    for (const p of items) {
      if (p.status !== 'publish' || p.content?.protected) continue;
      const path = pagePath(p.link);
      if (!path) throw new Error(`Unexpected page host for ${p.id}`);
      pages.push({...p, path});
    }
  }
  if (new Set(pages.map(p => p.path)).size !== pages.length) throw new Error('Duplicate page paths');
  return pages;
}

export function pageRevision(pages) {
  return sha(JSON.stringify(pages.map(p => [p.id, p.path, p.modified_gmt, p.featured_media, p.menu_order, p.parent, p.title.rendered, p.excerpt.rendered, p.content.rendered])));
}

export async function readPublication() {
  const [pages, homeHtml] = await Promise.all([
    readPages(),
    get(source + '/').then(response => response.text())
  ]);
  const home = load(homeHtml);
  const main = home('main').first();
  if (!main.length) throw new Error('The published home page has no main content');
  const icon = home('link[rel="icon"]').first().attr('href') || '';
  const revision = sha(JSON.stringify([pageRevision(pages), main.html(), icon]));
  return { pages, home, main, icon, revision };
}
