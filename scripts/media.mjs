import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { get, sha, source } from './cms.mjs';

const sourceHost = new URL(source).hostname;
export function uploadUrl(value) {
  if (!value) return null;
  let u;
  try { u = new URL(value, source); } catch { return null; }
  if (!['https:', 'http:'].includes(u.protocol)) return null;
  if (/^i[0-3]\.wp\.com$/.test(u.hostname)) {
    try { u = new URL('https:/' + u.pathname); } catch { return null; }
  }
  if (u.hostname === 'ghfabriccom.files.wordpress.com') return `${source}/wp-content/uploads${u.pathname}`;
  if (u.hostname === sourceHost && u.pathname.startsWith('/wp-content/uploads/')) return source + u.pathname;
  return null;
}

export function imageLibrary(destination) {
  const images = new Map();
  let queue = Promise.resolve();
  async function convert(url) {
    const dir = join(destination,'media');
    await mkdir(dir,{recursive:true});
    const response = await get(url + '?w=1680');
    const mime = response.headers.get('content-type') || '';
    if (!mime.startsWith('image/')) throw new Error(`Expected an image at ${url}`);
    const data = Buffer.from(await response.arrayBuffer());
    const pic = sharp(data,{limitInputPixels:65_000_000}).rotate();
    const name = sha(data).slice(0,16);
    const {data:large,info}=await pic.clone().resize({width:1440,withoutEnlargement:true}).webp({quality:86}).toBuffer({resolveWithObject:true});
    const full=`/media/${name}-${info.width}.webp`;
    await writeFile(join(destination,full),large);
    let srcset = `${full} ${info.width}w`;
    if (info.width > 640) {
      const small=`/media/${name}-640.webp`;
      await pic.clone().resize({width:640}).webp({quality:83}).toFile(join(destination,small));
      srcset=`${small} 640w, ${srcset}`;
    }
    const social=`/media/${name}-share.jpg`;
    await pic.clone().resize({width:1200,withoutEnlargement:true}).flatten({background:'#fffdf8'}).jpeg({quality:86,mozjpeg:true}).toFile(join(destination,social));
    return {src:full,srcset,social,width:info.width,height:info.height};
  }
  function load(value) {
    const canonical=uploadUrl(value);
    if (!canonical) return Promise.resolve(null);
    if (!images.has(canonical)) {
      const result=queue.then(()=>convert(canonical));
      queue=result.catch(()=>{});
      images.set(canonical,result);
    }
    return images.get(canonical);
  }
  return {load,count:()=>images.size};
}
