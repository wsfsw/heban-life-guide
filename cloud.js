let revision = null;
let pending = null;
let inFlight = null;
let timer;
let blocked = false;
let onChange = () => {};

export async function api(path, method = 'GET', body) {
  const response = await fetch(path, {
    method, cache: 'no-store', credentials: 'same-origin',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || (response.status === 401 ? '请先登录 ChatGPT。' : '暂时无法连接，请稍后再试。'));
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function connectCloud(listener) {
  onChange = listener;
  const result = await api('/api/state');
  if (!result.user || !Number.isSafeInteger(result.revision)) throw new Error('读取账户失败，请重新打开。');
  revision = result.revision;
  pending = null;
  blocked = false;
  onChange('saved');
  return result;
}

export function saveCloud(state) {
  if (revision === null) return false;
  pending = JSON.stringify(state);
  if (blocked) return true;
  onChange('saving');
  clearTimeout(timer);
  timer = setTimeout(flushCloud, 250);
  return true;
}

export async function flushCloud() {
  clearTimeout(timer);
  if (blocked || revision === null) return false;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    while (pending) {
      const item = pending;
      pending = null;
      try {
        const result = await api('/api/state', 'PUT', { revision, state: JSON.parse(item) });
        revision = result.revision;
      } catch (error) {
        pending ??= item;
        blocked = error.status === 409 || error.status === 401;
        onChange(error.status === 409 ? 'conflict' : error.status === 401 ? 'auth' : 'error', error.message);
        return false;
      }
    }
    onChange('saved');
    return true;
  })();
  try { return await inFlight; } finally { inFlight = null; }
}

export function unsyncedCloud() {
  return Boolean(pending || inFlight);
}
