import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askAssistant, directAssistantUrl } from '../assistant-client.js';

const site = 'https://heban.test/';
globalThis.document = { querySelector: () => ({ content: site }) };
let online = true;
Object.defineProperty(navigator, 'onLine', { get: () => online });

test('assistant shows a different recovery for an offline phone, an unavailable endpoint and a failed message', async (t) => {
  const input = { text: '你好' };
  let health;
  const requests = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.href, site + 'api/assistant');
    if (options.method === 'POST' || health === undefined) throw new TypeError('Failed to fetch');
    return Response.json({ online: health });
  });
  online = false;
  await assert.rejects(askAssistant(input), /手机没有连上网络/);
  assert.equal(requests.mock.callCount(), 1);
  online = true;
  await assert.rejects(askAssistant(input), { message: /当前网络暂时连不上/, canOpenDirect: true });
  assert.equal(requests.mock.callCount(), 3);
  health = true;
  await assert.rejects(askAssistant(input), { message: /这次请求没完成/, canOpenDirect: true });
  assert.equal(directAssistantUrl('capture/device'), site + '#/capture/device');
  health = false;
  await assert.rejects(askAssistant(input), /服务暂时不可用/);
});

test('assistant calls out a timeout and preserves useful server errors', async (t) => {
  const input = { text: '你好' };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reply;
  const requests = t.mock.method(globalThis, 'fetch', (_url, { signal }) => {
    if (reply) return Promise.resolve(reply);
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const result = askAssistant(input);
  t.mock.timers.tick(32_000);
  await assert.rejects(result, /回答等得太久/);
  assert.equal(requests.mock.callCount(), 1);
  reply = Response.json({ error: '当前网络的提问次数已满。' }, { status: 429 });
  await assert.rejects(askAssistant(input), /当前网络的提问次数/);
  reply = new Response('<html>Forbidden</html>', { status: 403 });
  await assert.rejects(askAssistant(input), { message: /这个页面暂时不能连接/, canOpenDirect: true });
  reply = Response.json({ answer: '您好。' });
  assert.deepEqual(await askAssistant(input), { answer: '您好。' });
});
