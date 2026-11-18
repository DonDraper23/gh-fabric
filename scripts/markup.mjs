import { load } from 'cheerio';
import { live, source } from './cms.mjs';
import { uploadUrl } from './media.mjs';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const text = html => load(html || '',null,false).text().replace(/\s+/g,' ').trim();
export const swatch = (name='') => 'https://wa.me/8613967549919?text=' + encodeURIComponent([
  name ? `Hi GH-Fabric, I would like to request a swatch of ${name}.` : 'Hi GH-Fabric, I would like to request a fabric swatch.',
  ...(!name?['Fabric name, reference or post link: ']:[]), 'Shade / photo: ', 'Estimated quantity (m): ', 'Destination: '
].join('\n'));

const safeTags = new Set('main section article div p h1 h2 h3 h4 h5 h6 a img span br hr b strong i em u s small sup sub blockquote cite ul ol li dl dt dd figure figcaption table caption thead tbody tfoot tr th td details summary pre code mark'.split(' '));
const safeStyle = /^(?:align-items|justify-content|aspect-ratio|background-color|color|display|flex-basis|flex-wrap|font(?:-family|-size|-style|-weight)|gap|height|width|max-width|min-width|letter-spacing|line-height|object-fit|object-position|text-align|text-decoration|text-transform|border(?:-radius)?|(?:padding|margin)(?:-(?:left|right|top|bottom))?)$/;

function inlineStyle(sourceStyle='') {
  return sourceStyle.split(';').map(part=>part.trim()).filter(part=>{
    const colon=part.indexOf(':');
    return colon>0 && safeStyle.test(part.slice(0,colon).trim()) && !/url\s*\(|expression\s*\(|javascript|[<>@\\]/i.test(part);
  }).join(';');
}

function cleanLink(value) {
  if (!value) return null;
  if (value.startsWith('#')) return value;
  let u;
  try { u=new URL(value,source); } catch { return null; }
  if (['mailto:','tel:'].includes(u.protocol)) return u.href;
  if (!['http:','https:'].includes(u.protocol)) return null;
  if ([new URL(source).host,new URL(live).host,'www.gh-fabric.com'].includes(u.host)) return u.pathname + u.search + u.hash;
  return u.href;
}

export async function portable(fragment,media) {
  const $=load(fragment,null,false);
  $('script,style,iframe,form,object,embed,noscript,link,meta,.sharedaddy,.jp-relatedposts,.wpcnt,.wpl-likebox').remove();
  for (const element of $('*').toArray()) {
    const el=$(element), tag=element.name;
    if (!safeTags.has(tag)) { el.replaceWith(el.contents()); continue; }
    const original={...element.attribs};
    Object.keys(original).forEach(a=>el.removeAttr(a));
    const cls=(original.class||'').split(/\s+/).filter(c=>/^(?:wp-block-[\w-]+|align(full|wide|left|right|center)|is-layout-(flex|constrained|flow)|are-vertically-aligned-center|has-[\w-]+|gh-[\w-]+)$/.test(c));
    if(cls.length) el.attr('class',cls.join(' '));
    if(original.id && /^[\w-]+$/.test(original.id)) el.attr('id',original.id);
    const style=inlineStyle(original.style); if(style) el.attr('style',style);
    for (const att of ['scope','colspan','rowspan','lang','dir','aria-label']) if(original[att]) el.attr(att,original[att]);
    if (tag==='a') {
      const href=original.href;
      if(uploadUrl(href) && /\.(?:jpe?g|png|webp|avif|gif)(?:[?#]|$)/i.test(href)) {
        el.attr('href',(await media.load(href)).src);
      } else if (cleanLink(href)) el.attr('href',cleanLink(href));
      if(original.target==='_blank') el.attr({target:'_blank',rel:'noopener noreferrer'});
    }
    if (tag==='img') {
      const local=await media.load(original['data-orig-file']||original.src);
      if(local) {
        el.attr({src:local.src,srcset:local.srcset,width:local.width,height:local.height});
      } else if(original.src && /^https:\/\//i.test(original.src)) {
        el.attr('src',original.src);
      } else { el.remove(); continue; }
      el.attr({alt:original.alt||'',decoding:'async',loading:original.loading==='eager'?'eager':'lazy',sizes:'(max-width: 781px) 90vw, (max-width: 1340px) 50vw, 680px'});
      if(original.fetchpriority==='high')el.attr('fetchpriority','high');
    }
  }
  return $.html();
}

export function layout({title,description,path,body,share,icon,archive=true}) {
  const absolute=new URL(path,live).href;
  const heading=title==='GH-Fabric'?'GH-Fabric – Apparel fabrics and swatches from Keqiao, China':`${title} – GH-Fabric`;
  const titleTag=esc(heading), desc=esc(description), picture=share?esc(new URL(share,live).href):null;
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titleTag}</title><meta name="description" content="${desc}"><link rel="canonical" href="${esc(absolute)}"><meta property="og:type" content="website"><meta property="og:site_name" content="GH-Fabric"><meta property="og:title" content="${titleTag}"><meta property="og:description" content="${desc}"><meta property="og:url" content="${esc(absolute)}">${picture?`<meta property="og:image" content="${picture}"><meta name="twitter:card" content="summary_large_image">`:''}${icon?`<link rel="icon" href="${esc(icon)}">`:''}<link rel="stylesheet" href="/site.css"></head><body>
<a class="skip" href="#content">Skip to content</a>
<header class="site-head"><nav aria-label="Main navigation"><a class="brand" href="/">GH-Fabric</a><div><a href="/#fabrics">Fabrics</a><a href="/#samples">Swatches</a></div></nav></header>
<main id="content">${body}</main>
<footer><div class="footer-inner"><div><p class="eyebrow">Keqiao · Shaoxing</p><p class="footer-brand">GH-Fabric</p><p>Room 710, Yinan Center, 1088 Jinkeqiao Avenue<br>Keqiao, Shaoxing, Zhejiang, China</p></div><div><p><a href="${esc(swatch())}">WhatsApp +86 139 6754 9919</a><br><a href="mailto:info@gh-fabric.com">info@gh-fabric.com</a></p><p><a href="https://www.instagram.com/ghfabric2011/">Instagram</a> · <a href="https://www.facebook.com/profile.php?id=61557913450707">Facebook</a>${archive?' · <a href="/new-collection/">Collection archive</a>':''}</p></div></div></footer>
</body></html>\n`;
}
