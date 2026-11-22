import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../api.js';
import { localStorageBindings } from '../scripts/storage.mjs';

const origin = 'https://heban.test';
const statePath = '/api/state';

function client(env, id) {
  return async (route, method = 'GET', body, requestOrigin = origin, contentType = 'application/json') => {
    const headers = new Headers();
    if (id) headers.set('oai-authenticated-user-id', id);
    if (method !== 'GET') headers.set('origin', requestOrigin);
    if (body !== undefined) headers.set('content-type', contentType);
    return handleApi(new Request(origin + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  };
}

test('assistant sends text and inline images to DeepSeek and returns the allowed Pages origin', async (t) => {
  const env = await localStorageBindings();
  t.after(env.close);
  const local = client(env);
  assert.deepEqual(await (await local('/api/assistant')).json(), { online: false });
  env.DEEPSEEK_API_KEY = 'fixture-key';
  const pages = 'https://wsfsw.github.io';
  const preflight = await local('/api/assistant', 'OPTIONS', undefined, pages);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), pages);
  assert.equal((await local('/api/assistant', 'POST', { text: '怎么用？' }, 'https://elsewhere.test')).status, 403);
  assert.equal((await local('/api/assistant', 'POST', { photo: 'https://elsewhere.test/photo.jpg' })).status, 422);
  const fixture = { observation: '看到了遥控器。', steps: ['找有雪花图案的模式。'], verify: '先看清模式字样。', choices: ['怎么开机'] };
  const call = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer fixture-key');
    assert.equal(options.redirect, 'manual');
    const sent = JSON.parse(options.body);
    assert.equal(sent.model, 'deepseek-flash');
    const content = sent.messages.at(-1).content;
    if (Array.isArray(content)) {
      assert.equal(content[1].image_url.url, 'data:image/jpeg;base64,/9j/2Q==');
      assert.ok(content[0].text.includes('想制冷'));
      assert.equal(sent.response_format.type, 'json_object');
    } else assert.equal(content, '怎么调大音量？');
    return Response.json({ choices: [{ message: { content: Array.isArray(content) ? JSON.stringify(fixture) : '按音量加键。' } }] });
  });
  const text = await local('/api/assistant', 'POST', { text: '怎么调大音量？' });
  assert.deepEqual(await text.json(), { answer: '按音量加键。' });
  const imageInput = { photo: 'data:image/jpeg;base64,/9j/2Q==', text: '想制冷' };
  assert.equal((await local('/api/assistant', 'POST', imageInput, 'https://elsewhere.test', 'text/plain')).status, 403);
  assert.equal((await local('/api/assistant', 'POST', imageInput, origin, 'text/plain')).status, 400);
  const image = await local('/api/assistant', 'POST', imageInput, pages, 'text/plain;charset=UTF-8');
  assert.equal(image.headers.get('access-control-allow-origin'), pages);
  assert.deepEqual(await image.json(), { analysis: fixture });
  assert.equal(call.mock.callCount(), 2);
});

test('family shortcuts are added for connected accounts and revoked with the connection', async (t) => {
  const env = await localStorageBindings();
  t.after(env.close);
  const elder = client(env, 'elder');
  const family = client(env, 'child');
  const stranger = client(env, 'stranger');
  const path = '/api/family/shortcuts';
  const feature = { kind: 'built-in', target: 'camera', recipient: 'elder' };
  assert.equal((await family(path, 'POST', feature)).status, 403);
  const { code } = await (await family('/api/family/invite', 'POST')).json();
  assert.equal((await elder('/api/family/join', 'POST', { code })).status, 200);
  assert.equal((await family(path, 'POST', { kind: 'website', target: 'javascript:alert(1)', title: '恶意入口', recipient: 'elder' })).status, 422);
  const added = await family(path, 'POST', feature);
  assert.equal(added.status, 201);
  assert.equal((await family(path, 'POST', feature)).status, 409);
  const { shortcuts } = await (await elder('/api/family')).json();
  assert.equal(shortcuts[0].title, '拍照分析');
  assert.equal(shortcuts[0].direction, 'received');
  assert.deepEqual((await (await stranger('/api/family')).json()).shortcuts, []);
  assert.equal((await elder(path + '/' + shortcuts[0].id, 'DELETE')).status, 200);
  assert.equal((await (await elder('/api/family')).json()).shortcuts.length, 1);
  await elder('/api/family/link/child', 'DELETE');
  assert.deepEqual((await (await elder('/api/family')).json()).shortcuts, []);
  assert.deepEqual((await (await family('/api/family')).json()).shortcuts, []);
});

test('login, account isolation, revision conflicts and cross-origin protection', async (t) => {
  const env = await localStorageBindings();
  t.after(env.close);
  const elder = client(env, 'elder');
  assert.equal((await client(env)(statePath)).status, 401);
  assert.equal((await elder(statePath, 'PUT', { revision: 0, state: {} }, 'https://other.test')).status, 403);
  const saved = await elder(statePath, 'PUT', { revision: 0, state: {
    reminders: [{ id: 'reminder-1', title: '买菜', at: Date.now() + 3600_000, owner: 'elder' }],
    speechRate: 'faster',
    guideRuns: { parcel: { version: 1, screen: 'code', updatedAt: Date.now(), history: ['pick'], failed: 0 } },
  } });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 1);
  const mine = await (await elder(statePath)).json();
  assert.equal(mine.state.reminders[0].title, '买菜');
  assert.equal(mine.state.speechRate, 'faster');
  assert.equal(mine.state.guideRuns.parcel.screen, 'code');
  assert.deepEqual((await (await client(env, 'stranger')(statePath)).json()).state, {});
  assert.equal((await elder(statePath, 'PUT', { revision: 0, state: {} })).status, 409);
});

test('one-time family invites, deliberate sharing, photo access and revocation', async (t) => {
  const env = await localStorageBindings();
  t.after(env.close);
  const elder = client(env, 'elder');
  const family = client(env, 'family');
  const stranger = client(env, 'stranger');
  const device = { id: 'remote1', name: '客厅遥控器', photo: 'data:image/jpeg;base64,/9j/2Q==', steps: [{ text: '按电源键', x: 0.2, y: 0.3 }] };
  const saved = await elder(statePath, 'PUT', { revision: 0, state: {
    deviceGuides: [device],
    messages: { ask: [{ id: 'question1', role: 'user', text: '如何查电费？' }, { id: 'private', role: 'user', text: '私人问题' }] },
  } });
  assert.equal(saved.status, 200);
  const photo = (await (await elder(statePath)).json()).state.deviceGuides[0].photo;
  assert.match(photo, /^\/api\/photo\/[0-9a-f]{64}$/);
  assert.equal((await elder(photo)).headers.get('content-type'), 'image/jpeg');
  assert.equal((await family(photo)).status, 404);
  assert.equal((await stranger(statePath, 'PUT', { revision: 0, state: { deviceGuides: [{ ...device, photo }] } })).status, 403);
  const shareCard = { recipient: 'family', kind: 'device', itemId: device.id };
  assert.equal((await elder('/api/family/share', 'POST', shareCard)).status, 403);
  const invite = await (await elder('/api/family/invite', 'POST')).json();
  assert.equal((await elder('/api/family/join', 'POST', { code: invite.code })).status, 422);
  assert.equal((await family('/api/family/join', 'POST', { code: invite.code })).status, 200);
  assert.equal((await stranger('/api/family/join', 'POST', { code: invite.code })).status, 422);
  assert.equal((await family(photo)).status, 404);
  const share = await elder('/api/family/share', 'POST', shareCard);
  assert.equal(share.status, 201);
  const posted = (await share.json()).items[0];
  assert.equal(posted.payload.steps[0].text, '按电源键');
  assert.equal((await family(photo)).status, 200);
  assert.equal((await stranger(photo)).status, 404);
  assert.equal((await elder('/api/family/share', 'POST', { recipient: 'family', kind: 'question', itemId: 'question1' })).status, 201);
  const inbox = (await (await family('/api/family')).json()).items;
  assert.equal(inbox.length, 2);
  assert.ok(inbox.every((item) => item.direction === 'received' && item.payload.title !== '私人问题'));
  await family('/api/family/share/' + posted.id, 'DELETE');
  assert.equal((await family(photo)).status, 200);
  await elder('/api/family/share/' + posted.id, 'DELETE');
  assert.equal((await family(photo)).status, 404);
  await family('/api/family/link/elder', 'DELETE');
  assert.equal((await (await family('/api/family')).json()).items.length, 0);
});

test('scene photos require sign-in, remain private to the owner and can be deleted', async (t) => {
  const env = await localStorageBindings();
  t.after(env.close);
  const elder = client(env, 'elder');
  const family = client(env, 'family');
  const route = '/api/records';
  const draft = { scene: 'parcel', note: '柜门未打开', photo: 'data:image/jpeg;base64,/9j/2Q==', source: 'camera' };
  assert.equal((await client(env)(route, 'POST', draft)).status, 401);
  assert.equal((await elder(route, 'POST', draft, 'https://other.test')).status, 403);
  assert.equal((await elder(route, 'POST', { ...draft, scene: 'unknown' })).status, 422);
  const response = await elder(route, 'POST', draft);
  assert.equal(response.status, 201);
  const { record } = await response.json();
  const recordRoute = route + '/' + record.id;
  assert.equal(record.note, draft.note);
  assert.equal(record.source, 'camera');
  assert.ok(record.createdAt <= Date.now());
  assert.deepEqual((await (await elder(route)).json()).records, [record]);
  const invite = await (await elder('/api/family/invite', 'POST')).json();
  assert.equal((await family('/api/family/join', 'POST', { code: invite.code })).status, 200);
  assert.deepEqual((await (await family(route)).json()).records, []);
  assert.equal((await family(recordRoute)).status, 404);
  assert.equal((await family(record.photo)).status, 404);
  assert.equal((await family(recordRoute, 'DELETE')).status, 404);
  const photo = await elder(record.photo);
  assert.equal(photo.headers.get('cache-control'), 'private, no-store');
  assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await photo.arrayBuffer())], [255, 216, 255, 217]);
  assert.equal((await elder(recordRoute, 'DELETE')).status, 200);
  assert.equal((await elder(record.photo)).status, 404);
  assert.equal(await env.BUCKET.get('evidence-' + record.id + '.jpg'), null);
  assert.deepEqual((await (await elder(route)).json()).records, []);
});

test('device sign-in rejects forged verification and one-time challenge replay', async (t) => {
  const env = await localStorageBindings();
  t.after(env.close);
  const anonymous = client(env);
  const path = '/api/auth/options';
  const profile = { mode: 'create', name: '测试用户', email: 'test@example.test' };
  assert.equal((await anonymous(path, 'POST', profile, 'https://other.test')).status, 403);
  assert.equal((await anonymous(path, 'POST', { ...profile, email: 'bad' })).status, 422);
  assert.deepEqual(await (await anonymous('/api/auth/session')).json(), { signedIn: false });
  const created = await anonymous(path, 'POST', profile);
  assert.equal(created.status, 200);
  const { options } = await created.json();
  assert.equal(options.rp.id, 'heban.test');
  assert.equal(options.authenticatorSelection.userVerification, 'required');
  const forged = { challenge: options.challenge, response: { id: 'forged', type: 'public-key' } };
  const rejected = await anonymous('/api/auth/verify', 'POST', forged);
  assert.equal(rejected.status, 401);
  assert.equal(rejected.headers.has('Set-Cookie'), false);
  assert.equal((await anonymous('/api/auth/verify', 'POST', forged)).status, 400);
  assert.equal((await anonymous(statePath)).status, 401);
});
