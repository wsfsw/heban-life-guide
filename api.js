class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const fail = (status, message) => { throw new RequestError(status, message); };
const hours = (count) => count * 3_600_000;
const safeId = /^[A-Za-z0-9_-]{1,128}$/;
const photoId = /^[a-f0-9]{64}$/;
const picturePath = /^\/api\/photo\/([a-f0-9]{64})$/;
const recordPath = /^\/api\/records\/([0-9a-f-]{36})(\/photo)?$/;
const recordScenes = ['parcel', 'bill', 'device', 'other'];
const phonePattern = /^\+?\d{5,18}$/;
const lines = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const timestamp = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 4_102_444_800_000 ? value : null;
const list = (value, max) => Array.isArray(value) ? value.slice(0, max) : [];
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

function authenticatedUser(request) {
  const id = request.headers.get('oai-authenticated-user-id');
  if (!id || !safeId.test(id)) fail(401, '请先登录 ChatGPT。');
  let name = request.headers.get('oai-authenticated-user-full-name') || '';
  if (request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try { name = decodeURIComponent(name); } catch { name = ''; }
  }
  return { id, name: lines(name, 40) || '禾伴用户' };
}

async function readJson(request, max = 24_000) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('application/json') || !request.body) fail(400, '请检查提交的内容。');
  if (Number(request.headers.get('content-length')) > max) fail(413, '提交的内容过大。');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let input = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) fail(413, '提交的内容过大。');
      input += decoder.decode(value, { stream: true });
    }
    return JSON.parse(input + decoder.decode());
  } catch (error) {
    if (error instanceof RequestError) throw error;
    fail(400, '请检查提交的内容。');
  } finally { reader.releaseLock(); }
}

async function digest(value) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
const get = (db, sql, ...values) => db.prepare(sql).bind(...values).first();
const all = async (db, sql, ...values) => (await db.prepare(sql).bind(...values).all()).results;
const run = (db, sql, ...values) => db.prepare(sql).bind(...values).run();

async function ownedProfile(db, user) {
  const current = await get(db, 'SELECT display_name, revision, state FROM profiles WHERE user_id = ?', user.id);
  if (current) return current;
  await run(db, 'INSERT OR IGNORE INTO profiles VALUES (?, ?, 0, ?)', user.id, user.name, '{}');
  return get(db, 'SELECT display_name, revision, state FROM profiles WHERE user_id = ?', user.id);
}

function decodePicture(source) {
  if (typeof source !== 'string') fail(422, '请重新选择照片。');
  const encoded = source.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/)?.[1];
  if (!encoded || source.length > 190_000) fail(422, '请选择有效的照片。');
  let bytes;
  try { bytes = Uint8Array.from(atob(encoded), (letter) => letter.charCodeAt(0)); }
  catch { fail(422, '请选择有效的照片。'); }
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) fail(422, '请选择有效的照片。');
  return { bytes, encoded };
}

async function storePicture(env, owner, source) {
  const existing = typeof source === 'string' ? source.match(picturePath)?.[1] : null;
  if (existing) {
    if (!await get(env.DB, 'SELECT id FROM photos WHERE id = ? AND owner_id = ?', existing, owner)) fail(403, '这张照片不在您的账户里。');
    return source;
  }
  const { bytes, encoded } = decodePicture(source);
  const id = await digest(`${owner}:${encoded}`);
  if (!await get(env.DB, 'SELECT id FROM photos WHERE id = ? AND owner_id = ?', id, owner)) {
    await env.BUCKET.put(id, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
    await run(env.DB, 'INSERT OR IGNORE INTO photos VALUES (?, ?)', id, owner);
  }
  return `/api/photo/${id}`;
}

const recordColumns = 'id, scene, note, source, created_at AS createdAt';
const recordKey = (id) => `evidence-${id}.jpg`;
const recordView = (record) => ({ ...record, photo: `/api/records/${record.id}/photo` });

async function createRecord(request, env, user) {
  const data = await readJson(request, 205_000);
  if (!data || !recordScenes.includes(data.scene) || !['camera', 'album'].includes(data.source)) fail(422, '请选择照片的用途。');
  const { bytes } = decodePicture(data.photo);
  const count = await get(env.DB, 'SELECT count(*) AS total FROM scene_records WHERE owner_id = ?', user.id);
  if (count.total >= 24) fail(422, '最多保存 24 条现场记录，请先整理旧照片。');
  const record = { id: crypto.randomUUID(), scene: data.scene, note: lines(data.note, 140), source: data.source, createdAt: Date.now() };
  const key = recordKey(record.id);
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
  try {
    const result = await run(env.DB, `INSERT INTO scene_records SELECT ?, ?, ?, ?, ?, ?
      WHERE (SELECT count(*) FROM scene_records WHERE owner_id = ?) < 24`, record.id, user.id, record.scene, record.note, record.source, record.createdAt, user.id);
    if (!result.meta.changes) fail(422, '最多保存 24 条现场记录，请先整理旧照片。');
  } catch (error) {
    await env.BUCKET.delete(key);
    throw error;
  }
  return json({ record: recordView(record) }, 201);
}

async function serveRecord(env, user, method, id, photo) {
  const record = await get(env.DB, `SELECT ${recordColumns} FROM scene_records WHERE id = ? AND owner_id = ?`, id, user.id);
  if (!record) fail(404, '找不到这条现场记录。');
  if (method === 'GET' && !photo) return json({ record: recordView(record) });
  if (method === 'GET' && photo) {
    const object = await env.BUCKET.get(recordKey(id));
    if (!object) fail(404, '找不到这张照片。');
    return new Response(object.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (method === 'DELETE' && !photo) {
    await env.BUCKET.delete(recordKey(id));
    await run(env.DB, 'DELETE FROM scene_records WHERE id = ? AND owner_id = ?', id, user.id);
    return json({ removed: true });
  }
  fail(405, '这个操作不可用。');
}

function cleanMessages(source) {
  return list(source, 160).flatMap((entry) => {
    if (!safeId.test(entry?.id ?? '') || !['user', 'assistant'].includes(entry.role)) return [];
    const text = lines(entry.text, 1000);
    if (!text) return [];
    const at = timestamp(entry.draft?.at);
    const draft = at && lines(entry.draft.title, 80)
      ? { at, title: lines(entry.draft.title, 80), repeat: entry.draft.repeat === 'daily' ? 'daily' : 'never' } : null;
    return [{ id: entry.id, role: entry.role, text, draft }];
  });
}

async function cleanState(env, owner, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) fail(422, '账户数据格式有误。');
  const deviceGuides = [];
  for (const card of list(source.deviceGuides, 8)) {
    if (!safeId.test(card?.id ?? '') || !lines(card.name, 26)) continue;
    const steps = list(card.steps, 8).flatMap((step) => {
      if (!step || !Number.isFinite(step.x) || !Number.isFinite(step.y) || !lines(step.text, 100)) return [];
      return [{ text: lines(step.text, 100), x: Math.max(0, Math.min(1, step.x)), y: Math.max(0, Math.min(1, step.y)) }];
    });
    if (steps.length) deviceGuides.push({ id: card.id, name: lines(card.name, 26), steps, photo: await storePicture(env, owner, card.photo) });
  }
  const reminders = list(source.reminders, 100).flatMap((item) => {
    if (!safeId.test(item?.id ?? '') || !timestamp(item.at) || !lines(item.title, 80)) return [];
    return [{ id: item.id, title: lines(item.title, 80), at: item.at, owner: item.owner === 'family' ? 'family' : 'elder',
      repeat: ['daily', 'weekly'].includes(item.repeat) ? item.repeat : 'never', done: Boolean(item.done), notified: Boolean(item.notified) }];
  });
  const shared = list(source.shared, 100).flatMap((item) => safeId.test(item?.id ?? '') && timestamp(item.at) && lines(item.question, 300)
    ? [{ id: item.id, at: item.at, question: lines(item.question, 300) }] : []);
  const guideRuns = {};
  for (const name of ['bill', 'parcel']) {
    const entry = source.guideRuns?.[name];
    if (!Number.isSafeInteger(entry?.version) || !safeId.test(entry.screen ?? '') || !timestamp(entry.updatedAt)) continue;
    guideRuns[name] = { version: entry.version, screen: entry.screen, updatedAt: entry.updatedAt,
      history: list(entry.history, 20).filter((key) => typeof key === 'string' && safeId.test(key)),
      failed: Number.isSafeInteger(entry.failed) ? Math.max(0, Math.min(10, entry.failed)) : 0 };
  }
  return {
    persona: ['小禾', '小松', '暖暖'].includes(source.persona) ? source.persona : '小禾',
    interests: lines(source.interests, 80), contactName: lines(source.contactName, 18) || '爸妈',
    phone: typeof source.phone === 'string' && phonePattern.test(source.phone) ? source.phone : '',
    listen: Boolean(source.listen), greeted: Boolean(source.greeted),
    monitoring: Boolean(source.monitoring), quietDays: [1, 2, 3, 5, 7].includes(source.quietDays) ? source.quietDays : 3,
    lastSeen: source.monitoring ? timestamp(source.lastSeen) : null,
    reminders, shared, deviceGuides, guideRuns,
    messages: Object.fromEntries(['chat', 'ask', 'family-chat'].map((key) => [key, cleanMessages(source.messages?.[key])])),
  };
}

const connection = 'person_a = min(?, ?) AND person_b = max(?, ?)';
const pair = (a, b) => [a, b, a, b];

async function familyData(db, user) {
  const links = await all(db, `SELECT p.user_id as id, p.display_name as name
    FROM family_links f JOIN profiles p ON p.user_id = CASE WHEN f.person_a = ? THEN f.person_b ELSE f.person_a END
    WHERE f.person_a = ? OR f.person_b = ? ORDER BY f.created_at DESC`, user.id, user.id, user.id);
  const items = await all(db, `SELECT s.id, s.kind, s.payload, s.created_at as at,
    CASE WHEN s.sender_id = ? THEN 'sent' ELSE 'received' END as direction, p.display_name as name
    FROM family_shares s JOIN family_links f ON f.person_a = min(s.sender_id, s.recipient_id) AND f.person_b = max(s.sender_id, s.recipient_id)
    JOIN profiles p ON p.user_id = CASE WHEN s.sender_id = ? THEN s.recipient_id ELSE s.sender_id END
    WHERE s.recipient_id = ? OR s.sender_id = ? ORDER BY s.created_at DESC LIMIT 100`, user.id, user.id, user.id, user.id);
  return { links, items: items.map((item) => ({ ...item, payload: JSON.parse(item.payload) })) };
}

async function routeApi(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;
  const user = authenticatedUser(request);
  if (!env.DB || !env.BUCKET) fail(503, '云端存储尚未就绪，请稍后重试。');
  if (!['GET', 'HEAD'].includes(method)) {
    if (request.headers.get('origin') !== url.origin) fail(403, '请从禾伴页面操作。');
  }
  const db = env.DB;
  if (pathname === '/api/records' && method === 'GET') {
    const entries = await all(db, `SELECT ${recordColumns} FROM scene_records WHERE owner_id = ? ORDER BY created_at DESC LIMIT 24`, user.id);
    return json({ records: entries.map(recordView) });
  }
  if (pathname === '/api/records' && method === 'POST') return createRecord(request, env, user);
  const record = pathname.match(recordPath);
  if (record) return serveRecord(env, user, method, record[1], Boolean(record[2]));
  if (method === 'GET' && pathname === '/api/state') {
    const record = await ownedProfile(db, user);
    return json({ user: { name: record.display_name }, revision: record.revision, state: JSON.parse(record.state) });
  }
  if (method === 'PUT' && pathname === '/api/state') {
    const { revision, state } = await readJson(request, 2_000_000);
    const record = await ownedProfile(db, user);
    if (revision !== record.revision) fail(409, '账户在另一台设备有更新，请先读取最新版本。');
    const cleaned = await cleanState(env, user.id, state);
    const result = await run(db, 'UPDATE profiles SET state = ?, revision = revision + 1 WHERE user_id = ? AND revision = ?', JSON.stringify(cleaned), user.id, revision);
    if (!result.meta.changes) fail(409, '账户在另一台设备有更新，请先读取最新版本。');
    return json({ revision: revision + 1 });
  }
  if (method === 'GET' && pathname.startsWith('/api/photo/')) {
    const id = pathname.match(picturePath)?.[1];
    if (!id || !photoId.test(id)) fail(404, '找不到照片。');
    const permitted = await get(db, `SELECT p.id FROM photos p WHERE p.id = ? AND (p.owner_id = ? OR EXISTS (
      SELECT 1 FROM family_shares s JOIN family_links f ON f.person_a = min(s.sender_id,s.recipient_id)
      AND f.person_b = max(s.sender_id,s.recipient_id) WHERE s.photo_id = p.id AND s.recipient_id = ?))`, id, user.id, user.id);
    if (!permitted) fail(404, '找不到照片。');
    const object = await env.BUCKET.get(id);
    if (!object) fail(404, '找不到照片。');
    return new Response(object.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (method === 'GET' && pathname === '/api/family') {
    await ownedProfile(db, user);
    return json(await familyData(db, user));
  }
  if (method === 'POST' && pathname === '/api/family/invite') {
    await ownedProfile(db, user);
    const code = randomCode();
    const expiresAt = Date.now() + hours(24);
    await db.batch([
      db.prepare('DELETE FROM invites WHERE issuer_id = ? OR expires_at <= ?').bind(user.id, Date.now()),
      db.prepare('INSERT INTO invites (code_hash, issuer_id, expires_at) VALUES (?, ?, ?)').bind(await digest(code), user.id, expiresAt),
    ]);
    return json({ code, expiresAt }, 201);
  }
  if (method === 'POST' && pathname === '/api/family/join') {
    const { code } = await readJson(request);
    const parsed = lines(code, 64).replace(/[\s-]/g, '').toUpperCase();
    if (!/^[A-F0-9]{20}$/.test(parsed)) fail(422, '请输入完整的邀请码。');
    await ownedProfile(db, user);
    const hash = await digest(parsed);
    const now = Date.now();
    const [_, claim] = await db.batch([
      db.prepare(`INSERT OR IGNORE INTO family_links
        SELECT min(issuer_id, ?), max(issuer_id, ?), ? FROM invites
        WHERE code_hash = ? AND accepted_by IS NULL AND expires_at > ? AND issuer_id <> ?`).bind(user.id, user.id, now, hash, now, user.id),
      db.prepare('UPDATE invites SET accepted_by = ? WHERE code_hash = ? AND accepted_by IS NULL AND expires_at > ? AND issuer_id <> ?').bind(user.id, hash, now, user.id),
    ]);
    if (!claim.meta.changes) fail(422, '邀请码已失效，或是您自己的邀请码。');
    return json(await familyData(db, user));
  }
  if (method === 'DELETE' && pathname.startsWith('/api/family/link/')) {
    const other = pathname.split('/').at(-1);
    if (!safeId.test(other)) fail(404, '找不到这位家人。');
    await db.batch([
      db.prepare(`DELETE FROM family_links WHERE ${connection}`).bind(...pair(user.id, other)),
      db.prepare('DELETE FROM family_shares WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)').bind(user.id, other, other, user.id),
    ]);
    return json(await familyData(db, user));
  }
  if (method === 'POST' && pathname === '/api/family/share') {
    const { recipient, kind, itemId } = await readJson(request);
    if (!safeId.test(recipient ?? '') || !safeId.test(itemId ?? '') || !['question', 'device'].includes(kind)) fail(422, '请选择家人和要分享的内容。');
    const state = JSON.parse((await ownedProfile(db, user)).state);
    const item = kind === 'device' ? state.deviceGuides?.find((entry) => entry.id === itemId)
      : state.messages?.ask?.find((entry) => entry.role === 'user' && entry.id === itemId);
    if (!item) fail(404, '找不到该内容，请先保存再分享。');
    const payload = kind === 'device' ? { title: item.name, photo: item.photo, steps: item.steps } : { title: item.text };
    const photo = kind === 'device' ? item.photo.match(picturePath)?.[1] ?? null : null;
    const result = await run(db, `INSERT INTO family_shares SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM family_links WHERE ${connection})`, crypto.randomUUID(), user.id, recipient,
      kind, JSON.stringify(payload), photo, Date.now(), ...pair(user.id, recipient));
    if (!result.meta.changes) fail(403, '请先和这位家人建立连接。');
    return json(await familyData(db, user), 201);
  }
  if (method === 'DELETE' && pathname.startsWith('/api/family/share/')) {
    const id = pathname.split('/').at(-1);
    if (!safeId.test(id)) fail(404, '找不到这条分享。');
    await run(db, 'DELETE FROM family_shares WHERE id = ? AND sender_id = ?', id, user.id);
    return json(await familyData(db, user));
  }
  fail(404, '没有这个功能入口。');
}

export async function handleApi(request, env) {
  try { return await routeApi(request, env); }
  catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error('Heban API request failed', error.name);
    return json({ error: '服务暂时忙，稍后再试一下。' }, 500);
  }
}
