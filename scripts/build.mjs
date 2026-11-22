import { mkdir, readFile, writeFile } from 'node:fs/promises';

const output = new URL('../dist/server/', import.meta.url);
const root = new URL('../', import.meta.url);
const read = (file) => readFile(new URL(file, root), 'utf8');
const types = {
  'index.html': 'text/html; charset=utf-8',
  'styles.css': 'text/css; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8',
  'cloud.js': 'text/javascript; charset=utf-8',
  'devices.js': 'text/javascript; charset=utf-8',
  'records.js': 'text/javascript; charset=utf-8',
  'guides.js': 'text/javascript; charset=utf-8',
  'logic.js': 'text/javascript; charset=utf-8',
};
const assets = Object.fromEntries(await Promise.all(Object.entries(types).map(async ([file, type]) => [`/${file}`, { type, body: await read(file) }])));
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
await writeFile(new URL('index.js', output), moduleText);
console.log('Sites Worker built.');
