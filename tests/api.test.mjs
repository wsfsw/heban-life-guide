import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../api.js';
import { localStorageBindings } from '../scripts/storage.mjs';

const origin = 'https://heban.test';
const statePath = '/api/state';

function client(env, id) {
  return async (route, method = 'GET', body, requestOrigin = origin) => {
    const headers = new Headers();
    if (id) headers.set('oai-authenticated-user-id', id);
    if (method !== 'GET') headers.set('origin', requestOrigin);
    if (body !== undefined) headers.set('content-type', 'application/json');
    return handleApi(new Request(origin + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  };
}

test('login, account isolation, revision conflicts and cross-origin protection', async (t) => {
  const env = await localStorageBindings();
  t.after(env.close);
  const elder = client(env, 'elder');
  assert.equal((await client(env)(statePath)).status, 401);
  assert.equal((await elder(statePath, 'PUT', { revision: 0, state: {} }, 'https://other.test')).status, 403);
  const saved = await elder(statePath, 'PUT', { revision: 0, state: {
    reminders: [{ id: 'reminder-1', title: '买菜', at: Date.now() + 3600_000, owner: 'elder' }],
    guideRuns: { parcel: { version: 1, screen: 'code', updatedAt: Date.now(), history: ['pick'], failed: 0 } },
  } });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 1);
  const mine = await (await elder(statePath)).json();
  assert.equal(mine.state.reminders[0].title, '买菜');
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
