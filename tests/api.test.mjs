import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../api.js';
import { localStorageBindings } from '../scripts/storage.mjs';
import assistantWorker from '../scripts/assistant-worker.mjs';
import { androidGuidePath, captionLines, phoneTopic } from '../phone-guide.js';

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
  const independentOrigin = 'https://assistant.heban.test';
  const image = await assistantWorker.fetch(new Request(independentOrigin + '/api/assistant', {
    method: 'POST', headers: { Origin: pages, 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(imageInput),
  }), env);
  assert.equal(image.headers.get('access-control-allow-origin'), pages);
  assert.deepEqual(await image.json(), { analysis: fixture });
  assert.equal((await assistantWorker.fetch(new Request(independentOrigin + '/api/state'), env)).status, 404);
  assert.equal(call.mock.callCount(), 2);
});

test('phone guidance is an optional assistant reply action with platform-specific steps', async (t) => {
  const env = await localStorageBindings();
  t.after(env.close);
  env.DEEPSEEK_API_KEY = 'fixture-key';
  const local = client(env);
  t.mock.method(globalThis, 'fetch', async (_url, { body }) => {
    const request = JSON.parse(body);
    assert.equal(request.response_format.type, 'json_object');
    const system = request.messages[0].content;
    const response = system.includes('这台是苹果手机')
      ? { title: '微信发照片', steps: ['打开微信。', '点进联系人的聊天。'] }
      : system.includes('androidApp') ? { title: '微信发照片', androidApp: 'wechat',
        steps: ['打开微信。', '', '点「相册」。'], targets: ['微信', '跳过', '相册'], after: ['', '跳过', '选择照片'] }
        : { answer: '可以从微信聊天里的加号开始。', offerPhoneGuide: request.messages.at(-1).content.includes('微信') };
    return Response.json({ choices: [{ message: { content: JSON.stringify(response) } }] });
  });
  const question = '微信怎么发照片？';
  const suggested = await local('/api/assistant', 'POST', { text: question, suggestPhoneGuide: true });
  assert.deepEqual(await suggested.json(), { answer: '可以从微信聊天里的加号开始。', offerPhoneGuide: true });
  const unrelated = await local('/api/assistant', 'POST', { text: '你好吗？', suggestPhoneGuide: true });
  assert.equal((await unrelated.json()).offerPhoneGuide, false);
  const selected = await local('/api/assistant', 'POST', { text: question, phonePlatform: 'iphone' });
  assert.deepEqual((await selected.json()).phoneGuide.steps, ['打开微信。', '点进联系人的聊天。']);
  const android = await local('/api/assistant', 'POST', { text: question, phonePlatform: 'android' });
  const path = androidGuidePath((await android.json()).phoneGuide);
  assert.deepEqual(JSON.parse(new URL('heban-guide://phone/' + path).searchParams.get('plan')), {
    title: '微信发照片', app: 'wechat',
    steps: [{ text: '打开微信。', target: '微信' }, { text: '点「相册」。', target: '相册', after: '选择照片' }],
  });
  assert.equal(androidGuidePath({ topic: 'font' }), 'font');
  const inferred = androidGuidePath({ androidApp: 'wechat', steps: [
    '打开微信，点底部“通讯录”', '不要点“删除”，点“返回”', '点“我”，再点“设置”',
  ] });
  const inferredSteps = JSON.parse(new URL('heban-guide://phone/' + inferred).searchParams.get('plan')).steps;
  assert.deepEqual(inferredSteps.map(({ target }) => target), ['通讯录', '', '']);
  assert.equal(phoneTopic('怎么放大手机字体？'), 'font');
  assert.equal(phoneTopic('怎么连家里的 Wi-Fi？'), 'wifi');
  assert.equal(phoneTopic('怎么关闭 Wi-Fi？'), '');
  const instruction = '在设置里搜索“字体大小”，点开对应的结果。';
  assert.equal(captionLines(instruction).join(''), instruction);
  assert.ok(captionLines(instruction).every((line) => Array.from(line).length <= 13));
});

test('asking retries an empty structured response as plain text within one request', async (t) => {
  const env = await localStorageBindings();
  t.after(env.close);
  env.DEEPSEEK_API_KEY = 'fixture-key';
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const request = JSON.parse(options.body);
    requests.push(request);
    const content = request.response_format ? '   ' : '打开微信，找到您要联系的人。';
    return Response.json({ choices: [{ message: { content }, finish_reason: 'stop' }] });
  });
  const question = '微信怎么发消息？';
  const response = await client(env)('/api/assistant', 'POST', { text: question, suggestPhoneGuide: true });
  assert.deepEqual(await response.json(), { answer: '打开微信，找到您要联系的人。', offerPhoneGuide: false });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].response_format.type, 'json_object');
  assert.equal(requests[1].response_format, undefined);
  assert.equal(requests[1].messages.at(-1).content, question);
  assert.equal((await env.DB.prepare('SELECT count(*) as total FROM assistant_requests').bind().first()).total, 1);
});

test('assistant distinguishes a shared network limit from the site-wide limit', async (t) => {
  const env = await localStorageBindings();
  t.after(env.close);
  env.DEEPSEEK_API_KEY = 'fixture-key';
  const ip = '192.0.2.5';
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('heban:' + ip));
  const visitor = Buffer.from(hash).toString('hex');
  const fill = (count, prefix, key) => env.DB.prepare(`WITH RECURSIVE sequence(n) AS (
    SELECT 1 UNION ALL SELECT n + 1 FROM sequence WHERE n < ?
  ) INSERT INTO assistant_requests SELECT ? || n, ?, ? FROM sequence`)
    .bind(count, prefix, key, Date.now()).run();
  const post = () => handleApi(new Request(origin + '/api/assistant', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ text: '你好' }),
  }), env);

  await fill(18, 'network-', visitor);
  const networkLimit = await post();
  assert.equal(networkLimit.status, 429);
  assert.match((await networkLimit.json()).error, /当前网络的提问次数/);
  await fill(102, 'site-', 'another-network');
  const dailyLimit = await post();
  assert.equal(dailyLimit.status, 429);
  assert.match((await dailyLimit.json()).error, /助手的使用次数/);
});

test('family shortcuts are added for connected accounts and revoked with the connection', async (t) => {
  const env = await localStorageBindings();
  t.after(env.close);
  const elder = client(env, 'elder');
  const family = client(env, 'child');
  const stranger = client(env, 'stranger');
  const path = '/api/family/shortcuts';
  const feature = { kind: 'built-in', target: 'washer', title: '洗衣步骤', recipient: 'elder' };
  assert.equal((await family(path, 'POST', feature)).status, 403);
  const { code } = await (await family('/api/family/invite', 'POST')).json();
  assert.equal((await elder('/api/family/join', 'POST', { code })).status, 200);
  assert.equal((await family(path, 'POST', { kind: 'website', target: 'javascript:alert(1)', title: '恶意入口', recipient: 'elder' })).status, 422);
  const added = await family(path, 'POST', feature);
  assert.equal(added.status, 201);
  assert.equal((await family(path, 'POST', feature)).status, 409);
  const { shortcuts } = await (await elder('/api/family')).json();
  assert.equal(shortcuts[0].title, '洗衣步骤');
  assert.equal(shortcuts[0].target, 'washer');
  assert.equal(shortcuts[0].direction, 'received');
  assert.deepEqual((await (await stranger('/api/family')).json()).shortcuts, []);
  assert.equal((await stranger(path + '/' + shortcuts[0].id, 'DELETE')).status, 200);
  assert.equal((await (await elder('/api/family')).json()).shortcuts.length, 1);
  assert.equal((await elder(path + '/' + shortcuts[0].id, 'DELETE')).status, 200);
  assert.deepEqual((await (await elder('/api/family')).json()).shortcuts, []);
  assert.deepEqual((await (await family('/api/family')).json()).shortcuts, []);
  assert.equal((await family(path, 'POST', { kind: 'built-in', target: 'camera', recipient: 'elder' })).status, 201);
  await elder('/api/family/link/child', 'DELETE');
  assert.deepEqual((await (await elder('/api/family')).json()).shortcuts, []);
  assert.deepEqual((await (await family('/api/family')).json()).shortcuts, []);
});

test('electricity cards preserve their entry across edits and limit access to the connected pair', async (t) => {
  const env = await localStorageBindings();
  t.after(env.close);
  const elder = client(env, 'elder');
  const family = client(env, 'child');
  const stranger = client(env, 'stranger');
  const base = '/api/family/cards';
  const photo = 'data:image/jpeg;base64,/9j/2Q==';
  const steps = [
    { id: 'open-service', text: '打开缴费页面', photo, x: 0.2, y: 0.3 },
    { id: 'choose-bill', text: '找到电费账单', photo, x: 0.4, y: 0.6, audio: 'data:audio/mpeg;base64,SURDAA==' },
  ];
  const draft = { recipient: 'elder', title: '查老家电费', steps };
  assert.equal((await family(base, 'POST', draft)).status, 403);
  const { code } = await (await family('/api/family/invite', 'POST')).json();
  await elder('/api/family/join', 'POST', { code });
  const created = await family(base, 'POST', draft);
  assert.equal(created.status, 201);
  const { id, revision } = await created.json();
  const path = base + '/' + id;
  assert.equal((await family(base, 'POST', draft)).status, 409);
  assert.equal((await stranger(path)).status, 404);
  assert.equal((await elder(path, 'PUT', { ...draft, revision })).status, 403);
  assert.equal((await family(path + '/help', 'POST', { stepId: 'choose-bill', revision })).status, 403);
  assert.deepEqual((await (await elder(path)).json()).steps[1], steps[1]);
  assert.equal((await elder(path + '/help', 'POST', { stepId: 'choose-bill', revision, photo })).status, 201);
  assert.equal((await (await family(base)).json()).cards[0].needsHelp, true);
  assert.deepEqual((await (await family(path)).json()).issue, { stepId: 'choose-bill', photo });
  assert.equal((await (await elder(path)).json()).issue, null);
  assert.equal((await elder(path + '/visibility', 'PATCH', { hidden: true })).status, 200);
  const newSteps = [steps[0], { ...steps[1], text: '在用电服务里点账单' }];
  assert.equal((await family(path, 'PUT', { ...draft, steps: newSteps, revision })).status, 200);
  const current = await (await elder(path)).json();
  assert.equal(current.id, id);
  assert.equal(current.revision, 2);
  assert.equal(current.hidden, true);
  assert.equal(current.steps[1].text, newSteps[1].text);
  assert.equal(current.needsHelp, false);
  assert.equal((await elder(path + '/help', 'POST', { stepId: 'choose-bill', revision })).status, 409);
  assert.equal((await elder(path + '/visibility', 'PATCH', { hidden: false })).status, 200);
  assert.equal((await (await elder(base)).json()).cards[0].hidden, false);
  assert.deepEqual((await (await elder('/api/family')).json()).items, []);
  await elder('/api/family/link/child', 'DELETE');
  assert.equal((await elder(path)).status, 404);
  assert.deepEqual((await (await family(base)).json()).cards, []);
});

test('family overview reads only the linked elder’s opted-in activity and recent conversations', async (t) => {
  const env = await localStorageBindings();
  t.after(env.close);
  const elder = client(env, 'elder');
  const family = client(env, 'watcher');
  const stranger = client(env, 'stranger');
  const path = '/api/family/overview/elder';
  const lastSeen = Date.now() - 60_000;
  const state = { monitoring: true, lastSeen, messages: {
    ask: Array.from({ length: 13 }, (_, i) => ({ id: `question-${i}`, role: 'user', text: `问题 ${i}`, at: lastSeen })),
    chat: [{ id: 'reply', role: 'assistant', text: '您好。' }],
    'family-chat': [{ id: 'private', role: 'user', text: '私下的家属聊天' }],
  } };
  assert.equal((await elder(statePath, 'PUT', { revision: 0, state })).status, 200);
  assert.equal((await family(path)).status, 404);
  const { code } = await (await elder('/api/family/invite', 'POST')).json();
  assert.equal((await family('/api/family/join', 'POST', { code })).status, 200);
  const { links } = await (await elder('/api/family')).json();
  const person = links.find((item) => item.id === 'watcher');
  const overview = async () => (await family(path)).json();
  assert.deepEqual(await overview(), { name: '禾伴用户', activity: null, chats: null });
  assert.equal((await stranger(path)).status, 404);
  assert.equal((await client(env)(path)).status, 401);

  const save = (revision, permission) => elder(statePath, 'PUT', { revision, state: { ...state, familyVisibility: permission ? [permission] : [] } });
  assert.equal((await save(1, { id: person.id, linkedAt: person.linkedAt - 1, activity: true, chats: true })).status, 200);
  assert.equal((await overview()).activity, null);
  assert.equal((await save(2, { id: person.id, linkedAt: person.linkedAt, activity: true })).status, 200);
  assert.deepEqual((await overview()).activity, { lastSeen, quietDays: 3 });
  assert.equal((await overview()).chats, null);
  assert.equal((await save(3, { id: person.id, linkedAt: person.linkedAt, chats: true })).status, 200);
  const enabled = await overview();
  assert.equal(enabled.activity, null);
  assert.equal(enabled.chats.ask.length, 12);
  assert.deepEqual(enabled.chats.ask[0], { role: 'user', text: '问题 1', at: lastSeen });
  assert.deepEqual(enabled.chats.chat, [{ role: 'assistant', text: '您好。', at: null }]);
  assert.equal(Object.hasOwn(enabled.chats, 'family-chat'), false);
  assert.equal((await save(4, null)).status, 200);
  assert.equal((await overview()).chats, null);
  assert.equal((await save(5, { id: person.id, linkedAt: person.linkedAt, chats: true })).status, 200);
  await family('/api/family/link/elder', 'DELETE');
  assert.equal((await family(path)).status, 404);
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
    hiddenShortcuts: ['bill', 'reminders', 'invalid'],
    guideRuns: { parcel: { version: 1, screen: 'code', updatedAt: Date.now(), history: ['pick'], failed: 0 } },
  } });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 1);
  const mine = await (await elder(statePath)).json();
  assert.equal(mine.state.reminders[0].title, '买菜');
  assert.equal(mine.state.speechRate, 'faster');
  assert.deepEqual(mine.state.hiddenShortcuts, ['bill', 'reminders']);
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
