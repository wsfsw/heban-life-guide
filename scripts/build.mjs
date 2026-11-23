import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const output = new URL('../dist/server/', import.meta.url);
const pagesOutput = new URL('../dist-pages/', import.meta.url);
const root = new URL('../', import.meta.url);
const read = (file) => readFile(new URL(file, root), 'utf8');

if (process.argv.includes('--assistant')) {
  await build({
    entryPoints: [fileURLToPath(new URL('./assistant-worker.mjs', import.meta.url))],
    bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
    outfile: fileURLToPath(new URL('../dist/assistant/index.js', import.meta.url)),
  });
  console.log('Independent assistant Worker built.');
} else {
  const assets = await buildAssets();
  if (process.argv.includes('--pages')) await buildPages(assets);
  else await buildSiteWorker(assets);
}

async function buildAssets() {
  const types = {
    'index.html': 'text/html; charset=utf-8',
    'styles.css': 'text/css; charset=utf-8',
    'app.js': 'text/javascript; charset=utf-8',
    'cloud.js': 'text/javascript; charset=utf-8',
    'guest.js': 'text/javascript; charset=utf-8',
    'devices.js': 'text/javascript; charset=utf-8',
    'records.js': 'text/javascript; charset=utf-8',
    'guides.js': 'text/javascript; charset=utf-8',
    'logic.js': 'text/javascript; charset=utf-8',
    'assistant-client.js': 'text/javascript; charset=utf-8',
    'shortcuts.js': 'text/javascript; charset=utf-8',
  };
  const assets = Object.fromEntries(await Promise.all(Object.entries(types).map(async ([file, type]) => [`/${file}`, { type, body: await read(file) }])));
  for (const file of ['guide-kit.webp', 'voice-card.webp']) {
    const path = 'assets/' + file;
    assets['/' + path] = { type: 'image/webp', encoded: (await readFile(new URL(path, root))).toString('base64') };
  }
  const browser = await build({
    entryPoints: [fileURLToPath(new URL('sign-in.js', root))], bundle: true,
    platform: 'browser', format: 'esm', write: false, target: 'es2022',
  });
  assets['/sign-in.js'] = { type: types['app.js'], body: browser.outputFiles[0].text };
  return assets;
}

function independentAssistantOrigin() {
  const configured = process.env.HEBAN_ASSISTANT_ORIGIN?.trim();
  if (!configured) return '';
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || url.hostname === 'chatgpt.site' || url.hostname.endsWith('.chatgpt.site')) {
    throw new Error('HEBAN_ASSISTANT_ORIGIN must be an independent HTTPS origin without a path.');
  }
  return url.origin;
}

async function buildPages(assets) {
  const cloudSite = 'https://heban-life-guide.wsfsw2008.chatgpt.site/';
  const assistantOrigin = independentAssistantOrigin();
  const { outputFiles: [bundle] } = await build({
    entryPoints: [fileURLToPath(new URL('app.js', root))], bundle: true,
    platform: 'browser', format: 'esm', write: false, target: 'es2021',
  });
  const version = createHash('sha256').update(bundle.contents).digest('hex').slice(0, 12);
  for (const [path, asset] of Object.entries(assets)) {
    const file = new URL(path.slice(1), pagesOutput);
    let contents = asset.encoded ? Buffer.from(asset.encoded, 'base64') : asset.body;
    if (path === '/app.js') contents = bundle.contents;
    if (path === '/index.html') {
      const assistantMeta = assistantOrigin ? `<meta name="heban-assistant-origin" content="${assistantOrigin}">\n    ` : '';
      contents = contents.replace('<title>', `<meta name="heban-cloud-site" content="${cloudSite}">\n    ${assistantMeta}<title>`)
        .replace('src="./app.js"', `src="./app.js?v=${version}"`);
    }
    await mkdir(dirname(fileURLToPath(file)), { recursive: true });
    await writeFile(file, contents);
  }
  await writeFile(new URL('.nojekyll', pagesOutput), '');
  console.log('GitHub Pages files built in dist-pages.');
}

async function buildSiteWorker(assets) {
  const server = await read('api.js');
  const moduleText = server + '\nconst siteAssets = ' + JSON.stringify(assets) + ';\n' + `
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return handleApi(request, env);
    const asset = siteAssets[pathname === '/' ? '/index.html' : pathname];
    if (!asset || !['GET','HEAD'].includes(request.method)) return new Response('Not found', { status: 404 });
    const headers = {
      'Content-Type': asset.type,
      'Cache-Control': asset.type.startsWith('image/') ? 'public, max-age=3600' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"
    };
    const body = request.method === 'HEAD' ? null
      : asset.encoded ? Uint8Array.from(atob(asset.encoded), (character) => character.charCodeAt(0)) : asset.body;
    return new Response(body, { headers });
  }
};
`;
  await mkdir(output, { recursive: true });
  await build({
    stdin: { contents: moduleText, resolveDir: fileURLToPath(root), sourcefile: 'heban-worker.js' },
    bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
    outfile: fileURLToPath(new URL('index.js', output)),
  });
  console.log('Sites Worker built.');
}
