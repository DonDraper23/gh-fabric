import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { load } from 'cheerio';
import { live } from './cms.mjs';

const root='dist';
const publication=JSON.parse(await readFile(join(root,'publication.json'),'utf8'));
const paths=new Set(['/',...publication.pages.map(p=>p.path)]);
const media=new Set();
for(const path of paths) {
  const markup=await readFile(join(root,path,'index.html'),'utf8');
  const $=load(markup);
  assert.equal($('h1').length,1,`One main title on ${path}`);
  assert.equal($('link[rel="canonical"]').attr('href'),new URL(path,live).href);
  assert(!$('script[src*="wp.com"],#marketingbar,.wpcom-site-banner').length);
  for(const el of $('img').toArray()) {
    const src=$(el).attr('src');
    if(src.startsWith('/media/'))media.add(src);
    assert(!/wordpress\.com|\.wp\.com/.test(src),`Source-host image on ${path}`);
    for(const resource of ($(el).attr('srcset')||'').split(',')){
      const file=resource.trim().split(' ')[0];if(file.startsWith('/media/'))media.add(file);
    }
  }
  const wa=$('a[href^="https://wa.me/"]');
  assert(wa.length,`Contact on ${path}`);
  for(const x of wa.toArray())assert.equal(new URL($(x).attr('href')).pathname,'/8613967549919');
  if(publication.products.includes(path)) {
    assert($('main a[href^="https://wa.me/"]').length,`Product contact on ${path}`);
    const og=$('meta[property="og:image"]').attr('content');
    if(og){const u=new URL(og);assert.equal(u.origin,live);media.add(u.pathname);}
  }
  if(path==='/'){
    for(const product of publication.products)assert($('#fabrics a').toArray().some(x=>$(x).attr('href')===product),`Catalogue link ${product}`);
    assert.equal($('#samples').length,1);
  }
}
await Promise.all([...media].map(p=>access(join(root,p))));
console.log(`Verified ${paths.size} public pages, ${publication.products.length} catalogue entries and ${media.size} local image variants.`);
