import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { localStorageBindings } from './storage.mjs';

await import('./build.mjs');
const { default: worker } = await import('../dist/server/index.js');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = await localStorageBindings(resolve(root, '.local'));
const port = Number(process.env.HEBAN_PORT || 4180);
const host = process.env.HEBAN_HOST === 'localhost' ? 'localhost' : '127.0.0.1';
const origin = `http://${host}:${port}`;
const devUsers = { elder: '本机测试长辈', family: '本机测试家属' };

const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, origin);
    if (url.origin !== origin) { outgoing.writeHead(400).end(); return; }
    const headers = new Headers(incoming.headers);
    for (const key of [...headers.keys()]) if (key.startsWith('oai-authenticated-')) headers.delete(key);
    const user = headers.get('cookie')?.match(/(?:^|;\s*)heban_dev=(elder|family)(?:;|$)/)?.[1];
    if (url.pathname === '/signin-with-chatgpt') {
      outgoing.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(
        '<!doctype html><meta name="viewport" content="width=device-width"><title>禾伴本机登录</title><h1>禾伴本机测试登录</h1><p>请选择一个本机测试身份。线上站点使用 ChatGPT 登录。</p><p><a href="/__dev/login/elder">长辈测试身份</a></p><p><a href="/__dev/login/family">家属测试身份</a></p>');
      return;
    }
    if (/^\/__dev\/login\/(elder|family)$/.test(url.pathname) || url.pathname === '/signout-with-chatgpt') {
      const signOut = url.pathname === '/signout-with-chatgpt';
      outgoing.writeHead(303, { Location: '/', 'Set-Cookie': signOut ? 'heban_dev=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/'
        : `heban_dev=${url.pathname.split('/').at(-1)}; HttpOnly; SameSite=Lax; Path=/` }).end();
      return;
    }
    if (user) {
      headers.set('oai-authenticated-user-id', `dev-${user}`);
      headers.set('oai-authenticated-user-full-name', encodeURIComponent(devUsers[user]));
      headers.set('oai-authenticated-user-full-name-encoding', 'percent-encoded-utf-8');
    }
    const options = { headers, method: incoming.method };
    if (!['GET', 'HEAD'].includes(incoming.method)) Object.assign(options, { body: Readable.toWeb(incoming), duplex: 'half' });
    const response = await worker.fetch(new Request(url, options), env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch { outgoing.writeHead(500).end('Local preview error'); }
});
server.listen(port, host, () => console.log(`禾伴本地预览：${origin}`));
process.on('SIGINT', () => server.close(() => { env.close(); process.exitCode = 0; }));
