import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import assistant from './assistant-worker.mjs';
import { localStorageBindings } from './storage.mjs';

const port = Number(process.env.PORT || 4181);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be a valid port number.');
const host = process.env.HEBAN_ASSISTANT_HOST || '127.0.0.1';
const address = new URL(process.env.HEBAN_ASSISTANT_ORIGIN || `http://127.0.0.1:${port}`);
if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password
  || address.pathname !== '/' || address.search || address.hash) {
  throw new Error('HEBAN_ASSISTANT_ORIGIN must be an HTTP(S) origin without a path.');
}
const { origin } = address;
const trustedProxy = process.env.HEBAN_ASSISTANT_TRUSTED_PROXY;
const key = process.env.DEEPSEEK_API_KEY?.trim();
if (!key) throw new Error('Configure the server-side DEEPSEEK_API_KEY before starting the assistant.');

const storage = await localStorageBindings(resolve(process.env.HEBAN_ASSISTANT_DATA_DIR || '.local/assistant'));
const env = { DB: storage.DB, DEEPSEEK_API_KEY: key };
const server = createServer({ requestTimeout: 60_000 }, async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, origin);
    if (url.origin !== origin) return outgoing.writeHead(400).end();
    const headers = new Headers(incoming.headers);
    const peer = incoming.socket.remoteAddress;
    const forwarded = peer && peer === trustedProxy ? headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() : '';
    headers.delete('cf-connecting-ip');
    const client = isIP(forwarded || '') ? forwarded : peer;
    if (client) headers.set('cf-connecting-ip', client);

    const options = { method: incoming.method, headers };
    if (!['GET', 'HEAD'].includes(incoming.method)) {
      Object.assign(options, { body: Readable.toWeb(incoming), duplex: 'half' });
    }
    const response = await assistant.fetch(new Request(url, options), env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end();
  }
});

server.listen(port, host, () => console.log(`禾伴助手已启动 · ${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => storage.close()));
