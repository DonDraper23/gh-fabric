import { readPublication } from './cms.mjs';

const publication = await readPublication();
if (!process.argv.includes('--compare')) {
  console.log(publication.revision);
} else {
  const manifest = new URL('/publication.json', 'https://gh-fabric.sylsinoe23.workers.dev');
  manifest.searchParams.set('check', Date.now());
  const result = await fetch(manifest, {cache: 'no-store', signal: AbortSignal.timeout(30000)});
  if (!result.ok && result.status !== 404) {
    throw new Error(`Cannot verify the deployed version: HTTP ${result.status}`);
  }
  const deployed = result.status === 404 ? null : await result.json();
  console.log(`changed=${deployed?.revision !== publication.revision}`);
}
