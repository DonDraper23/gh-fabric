import { cp, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { load } from 'cheerio';
import { get, live, pagePath, readPublication, source } from './cms.mjs';
import { imageLibrary, uploadUrl } from './media.mjs';
import { esc, layout, portable, swatch, text } from './markup.mjs';

const root=resolve('.');
const staging=await mkdtemp(join(root,'.gh-build-'));
const media=imageLibrary(staging);
const paths=[];
async function save(path,title,description,body,share,icon,hasArchive=true) {
  const file=path==='/404.html'?'404.html':join(path,'index.html');
  const target=join(staging,file);
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,layout({title,description,path,body,share,icon,archive:hasArchive}));
  if(path!=='/404.html')paths.push(path);
}

function curatedCards($) {
  const cards=new Map();
  $('#fabrics .wp-block-column').each((_,node)=>{
    const el=$(node), url=el.find('a[href]').first().attr('href');
    if(url)cards.set(pagePath(url),{description:el.find('h3').next('p').text().trim(),label:el.find('h3').prev('p').text().trim(),fit:el.find('img').attr('style')?.includes('object-fit:contain')?'contain':'cover'});
  });
  return cards;
}

async function preparePage(page,curated,pages) {
  const $=load(page.content.rendered,null,false);
  const main=$('main').first();
  const title=text(page.title.rendered);
  const imageNode=(main.length?main:$.root()).find('img').first();
  let photo=imageNode.attr('data-orig-file')||imageNode.attr('src');
  let alt=imageNode.attr('alt')||title;
  if(page.featured_media) {
    // WordPress.com can protect the media library endpoint while publishing the
    // same cover in the public page's share metadata.
    const sharing=load(await (await get(new URL(page.path,source))).text());
    const cover=sharing('meta[property="og:image"]').first().attr('content');
    if(uploadUrl(cover)) {
      if(uploadUrl(cover)!==uploadUrl(photo))alt=title;
      photo=cover;
    }
    alt=sharing('meta[property="og:image:alt"]').first().attr('content')||alt;
  }
  const image=await media.load(photo);
  const archive=page.path==='/new-collection/';
  const parent=pages.find(p=>p.id===page.parent);
  const product=!archive&&(curated.has(page.path)||Boolean(page.featured_media)||imageNode.length>0||parent?.path==='/new-collection/');
  const description=text(page.excerpt.rendered)||text((main.length?main:$.root()).find('p').first().text())||title;
  let body;
  if(main.length) {
    body=await portable(main.html(),media);
    if(product&&!main.find('a[href*="wa.me/"]').length)body+=`<div class="copy-area"><a class="button" href="${esc(swatch(title))}">Request this swatch on WhatsApp</a></div>`;
  } else {
    if (product && uploadUrl(photo) && uploadUrl(photo)===uploadUrl(imageNode.attr('data-orig-file')||imageNode.attr('src'))) {
      const figure=imageNode.closest('figure');
      if(figure.length&&!figure.find('figcaption').length)figure.remove();
      else if(!figure.length)imageNode.remove();
    }
    const inner=await portable($.html(),media);
    const hero=product&&image?`<img src="${image.src}" srcset="${image.srcset}" sizes="(max-width: 781px) 90vw, 580px" alt="${esc(alt)}" width="${image.width}" height="${image.height}" loading="eager" fetchpriority="high">`:'';
    body=`<section class="standard-hero"><div class="standard-inner"><div><p><a href="/#fabrics">← All fabrics</a></p><h1>${esc(title)}</h1>${product?`<a class="button" href="${esc(swatch(title))}">Request this swatch on WhatsApp</a>`:''}</div>${hero}</div></section><section class="copy-area">${inner}</section>`;
  }
  const heading=main.find('h1').first().text().trim()||title;
  const spec=main.find('h1').first().next('p').text().replace(/\s+/g,' ').trim();
  return {page,title,heading,product,body,photo,alt,image,description,spec};
}

function card(item,original) {
  const {page,heading,description,image,alt}=item;
  const editorialLabel=original?.label||'';
  const label=/\d\s*(?:g\/m²|gsm)/i.test(editorialLabel)?(/\d\s*(?:g\/m²|gsm)/i.test(item.spec)?item.spec:''):editorialLabel;
  const copy=original?.description||description;
  const thumb=image?`<a href="${esc(page.path)}"><img src="${image.src}" srcset="${image.srcset}" sizes="(max-width: 781px) 90vw, 370px" width="${image.width}" height="${image.height}" alt="${esc(alt)}" loading="lazy" style="object-fit:${original?.fit||'contain'}"></a>`:'';
  return `<article class="fabric-card">${thumb}<div>${label?`<p class="card-label">${esc(label)}</p>`:''}<h3>${esc(heading)}</h3>${copy?`<p>${esc(copy)}</p>`:''}<a href="${esc(page.path)}">View ${esc(heading)}</a></div></article>`;
}

try {
  const {pages,home,main:originalMain,icon:extracted,revision}=await readPublication();
  const originalCards=curatedCards(home);
  const icon=extracted?(await media.load(extracted))?.src:null;
  const prepared=[];
  for(const page of pages)prepared.push(await preparePage(page,originalCards,pages));
  const order=[...originalCards.keys()];
  const products=prepared.filter(p=>p.product).sort((a,b)=>{
    const ai=order.indexOf(a.page.path),bi=order.indexOf(b.page.path);
    if(ai>=0||bi>=0)return (ai<0?Infinity:ai)-(bi<0?Infinity:bi);
    return a.page.menu_order-b.page.menu_order||b.page.id-a.page.id;
  });
  const archive=pages.some(p=>p.path==='/new-collection/');
  const heroSrc=originalMain.find('img').first().attr('src');
  const heroImage=await media.load(heroSrc);
  // A card can outlive a withdrawn product in the editorial home template.
  // Rebuild the catalogue from public CMS pages instead of copying those links.
  const catalogue=originalMain.find('#fabrics').first();
  const slots=catalogue.find('.wp-block-columns').first();
  if(slots.length)slots.replaceWith('<div id="catalogue-slot"></div>');
  else if(catalogue.length)catalogue.append('<div id="catalogue-slot"></div>');
  else originalMain.append('<section id="fabrics"><h2>Featured fabrics</h2><div id="catalogue-slot"></div></section>');
  const knownPaths=new Set(pages.map(p=>p.path));
  originalMain.find('a[href]').each((_,a)=>{const el=home(a),path=pagePath(el.attr('href'));if(originalCards.has(path)&&!knownPaths.has(path))el.attr('href','/#fabrics');});
  const cleanHome=load(await portable(originalMain.html(),media),null,false);
  cleanHome('#catalogue-slot').replaceWith(`<div class="fabric-grid">${products.map(p=>card(p,originalCards.get(p.page.path))).join('')}</div>`);
  await save('/','GH-Fabric','Discover womenswear fabrics from Keqiao, Shaoxing. Explore two-tone Plasma and printed rayon, and request a fabric swatch on WhatsApp.',cleanHome.html(),heroImage?.social,icon,archive);
  for(const p of prepared) {
    if(p.page.path==='/')continue;
    await save(p.page.path,p.title,p.description,p.body,p.image?.social,icon,archive);
  }
  await save('/404.html','Page not found','Browse the current GH-Fabric collection.',`<div class="copy-area"><h1>Page not found</h1><p><a href="/#fabrics">Browse the fabric collection</a></p></div>`,null,icon,archive);
  await cp(join(root,'site.css'),join(staging,'site.css'));
  await writeFile(join(staging,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${live}/sitemap.xml\n`);
  await writeFile(join(staging,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p=>`<url><loc>${esc(new URL(p,live).href)}</loc></url>`).join('')}</urlset>\n`);
  await writeFile(join(staging,'_headers'),'/media/*\n  Cache-Control: public, max-age=31536000, immutable\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
  await writeFile(join(staging,'_redirects'),`/wp-admin ${source}/wp-admin/ 302\n/wp-admin/* ${source}/wp-admin/:splat 302\n/wp-login.php ${source}/wp-login.php 302\n/wp-content/uploads/* ${source}/wp-content/uploads/:splat 302\n`);
  await writeFile(join(staging,'publication.json'),JSON.stringify({revision,pages:prepared.map(p=>({id:p.page.id,path:p.page.path,modified:p.page.modified_gmt})),products:products.map(p=>p.page.path)})+'\n');
  await rm(join(root,'dist'),{recursive:true,force:true});
  await rename(staging,join(root,'dist'));
  console.log(`Built ${paths.length} pages including ${products.length} products and ${media.count()} locally hosted images.`);
} catch(error) {
  await rm(staging,{recursive:true,force:true});throw error;
}
