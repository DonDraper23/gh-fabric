const basePath = '/_cms/notify/';
const workflow = 'https://api.github.com/repos/DonDraper23/gh-fabric/actions/workflows/cms-reconcile.yml/dispatches';
const reply = status => new Response(null, {status, headers: {'Cache-Control': 'no-store'}});

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!path.startsWith(basePath)) return env.ASSETS.fetch(request);
    const key = path.slice(basePath.length);
    if (request.method !== 'POST' || !/^[\w-]{43}$/.test(key)) return reply(404);
    if (await digest(key) !== env.WORDPRESS_HOOK_HASH) return reply(404);
    if (!env.GITHUB_PUBLISH_KEY) return reply(503);
    if (Number(request.headers.get('content-length') || 0) > 4096) return reply(413);
    const body = await request.text();
    if (body.length > 4096) return reply(413);
    let fields;
    try {
      fields = request.headers.get('content-type')?.includes('application/json')
        ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body));
    } catch {
      return reply(400);
    }
    if (!fields || fields.hook !== 'publish_page') return reply(400);
    const id = String(fields.ID || '');
    const modified = String(fields.post_modified_gmt || '').replace(' ', 'T');
    const inputs = {source: 'wordpress'};
    if (/^\d{1,12}$/.test(id) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(modified)) {
      inputs.page_id = id;
      inputs.modified = modified;
    }
    const result = await fetch(workflow, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.GITHUB_PUBLISH_KEY,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'GH-Fabric WordPress publication',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({ref: 'master', inputs})
    });
    return reply(result.ok ? 202 : 502);
  }
};
