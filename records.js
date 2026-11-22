import { api } from './cloud.js';
import { compressPhoto, readDevicePhoto } from './devices.js';
import { formatWhen } from './logic.js';

const scenes = {
  parcel: { name: '快递和取件', guide: 'guide/parcel', action: '看快递柜取件指引' },
  bill: { name: '缴费和账单', guide: 'guide/bill', action: '看查电费指引' },
  device: { name: '设备和按键', guide: 'devices', action: '看设备使用指引' },
  other: { name: '其他生活场景', guide: 'guides', action: '查看生活操作指引' },
};

export function createRecords({ paint, pageHeader, escapeHtml, icon, showDialog, closeDialog, notify }) {
  let view = null;
  let camera = null;

  function stopCamera() {
    camera?.getTracks().forEach((track) => track.stop());
    camera = null;
  }

  function close() {
    stopCamera();
    view = null;
  }

  function open(route, id, from) {
    close();
    view = {
      route, id, mode: 'idle', photo: '', source: '', error: '', note: '',
      scene: Object.hasOwn(scenes, id) ? id : 'other',
      back: from === 'home' ? 'elder' : ['parcel', 'bill'].includes(id) ? `guide/${id}` : 'ask',
      loading: route !== 'capture',
    };
    if (view.loading) void load(view);
  }

  function redraw(current, focus) {
    if (view !== current) return;
    paint();
    if (focus) document.querySelector(focus)?.focus({ preventScroll: true });
  }

  async function load(current) {
    try {
      const result = await api(current.route === 'records' ? '/api/records' : `/api/records/${encodeURIComponent(current.id ?? '')}`);
      current.record = result.record;
      current.records = result.records;
    } catch (error) {
      current.error = error.message;
    } finally {
      current.loading = false;
      redraw(current);
    }
  }

  const captureLink = '<a class="button quiet" href="#/records">我的记录</a>';
  const help = '<p class="capture-help">拍清楚卡住的画面，避开取件码、账号等个人信息。照片只保存在您的账户。</p>';
  const filePicker = (id, label, native = false) => `<input type="file" id="${id}" class="capture-file" accept="image/*" ${native ? 'capture="environment"' : ''}><label for="${id}" class="button quiet capture-file-label">${icon(native ? 'camera' : 'photo', 21)}${label}</label>`;

  function captureScreen() {
    const { back, mode, photo, scene, error, note, native } = view;
    let body;
    if (mode === 'camera') {
      body = `<video id="capture-video" class="capture-frame" autoplay muted playsinline aria-label="相机画面"></video>
        <div class="capture-actions"><button class="button" id="capture-shutter" type="button" data-action="capture-shutter" disabled>${icon('camera', 22)}拍一张</button>
        <button class="button quiet" type="button" data-action="capture-reset">关闭相机</button></div>`;
    } else if (mode === 'review' || mode === 'saving') {
      const saving = mode === 'saving';
      body = `<img class="capture-frame" src="${photo}" alt="您要保存的现场照片">
        <form class="capture-form" data-form="scene-record">
          <label for="record-scene">这是什么场景？</label>
          <select id="record-scene" name="scene" ${saving ? 'disabled' : ''}>
            ${Object.entries(scenes).map(([key, item]) => `<option value="${key}" ${key === scene ? 'selected' : ''}>${item.name}</option>`).join('')}
          </select>
          <label for="record-note">备注（选填）</label>
          <textarea id="record-note" name="note" maxlength="140" rows="2" placeholder="如：输入后柜门没有打开" ${saving ? 'disabled' : ''}>${escapeHtml(note)}</textarea>
          <div class="capture-actions"><button id="capture-save" class="button" type="submit" ${saving ? 'disabled' : ''}>${saving ? '正在保存…' : '保存照片'}</button>
          <button class="button quiet" type="button" data-action="capture-reset" ${saving ? 'disabled' : ''}>重拍或换一张</button></div>
        </form>`;
    } else if (mode === 'opening' || mode === 'reading') {
      body = `<p class="capture-status" role="status">${mode === 'opening' ? '正在打开相机，请留意相机权限提示。' : '正在读取照片…'}</p>
        <button class="button quiet" type="button" data-action="capture-reset">取消</button>`;
    } else {
      body = `<div class="capture-actions">
        <button id="capture-open" class="button" type="button" data-action="capture-open">${icon('camera', 22)}打开相机</button>
        ${filePicker('capture-album', '从相册选择')}
        ${native ? filePicker('capture-native', '用手机相机拍') : ''}
      </div>`;
    }
    return `${pageHeader('拍照取证', back)}<main class="surface capture-screen">
      <div class="capture-intro"><div><h2>${mode === 'review' || mode === 'saving' ? '确认这张照片' : '拍下眼前的画面'}</h2>${help}</div>${captureLink}</div>
      ${error ? `<p class="capture-error" role="alert">${escapeHtml(error)}</p>` : ''}
      ${body}
    </main>`;
  }

  function recordsScreen() {
    return `${pageHeader('我的记录', 'elder')}<main class="surface capture-screen">
      <div class="capture-intro"><div><h2>现场照片</h2><p class="capture-help">只有您登录后可以查看。</p></div><a class="button" href="#/capture">${icon('camera', 22)}拍照取证</a></div>
      ${view.loading ? '<p role="status" class="empty-card">正在读取记录…</p>'
        : view.error ? retry()
        : !view.records.length ? '<p class="empty-card">还没有照片。遇到不会操作的画面，可以拍一张留着。</p>'
        : `<ul class="record-list">${view.records.map((record) => `<li><a href="#/record/${encodeURIComponent(record.id)}">
          <img src="${escapeHtml(record.photo)}" alt="" loading="lazy"><span><strong>${scenes[record.scene].name}</strong>
          <span>${escapeHtml(formatWhen(record.createdAt))}</span>${record.note ? `<span>${escapeHtml(record.note)}</span>` : ''}</span></a></li>`).join('')}</ul>`}
    </main>`;
  }

  function retry() {
    return `<p class="capture-error" role="alert">${escapeHtml(view.error)}</p><button class="button quiet" type="button" data-action="capture-retry">重新读取</button>`;
  }

  function recordScreen() {
    const { record, loading, error } = view;
    const scene = record && scenes[record.scene];
    return `${pageHeader('现场记录', 'records')}<main class="surface capture-screen">
      ${loading ? '<p role="status" class="empty-card">正在读取照片…</p>' : !record ? retry() : `
        <div class="capture-intro"><div><h2>${scene.name}</h2><p class="capture-help">保存于 ${escapeHtml(formatWhen(record.createdAt))}</p></div></div>
        ${error ? `<p class="capture-error" role="alert">${escapeHtml(error)}</p>` : ''}
        <img class="capture-frame" src="${escapeHtml(record.photo)}" alt="保存的现场照片">
        ${record.note ? `<p class="record-note">${escapeHtml(record.note)}</p>` : ''}
        <div class="capture-actions"><a class="button" href="#/${scene.guide}">${scene.action}</a><button class="button quiet" type="button" data-action="capture-delete">删除记录</button></div>`}
    </main>`;
  }

  function reset(current) {
    stopCamera();
    Object.assign(current, { mode: 'idle', error: '', photo: '' });
    redraw(current, '#capture-open');
  }

  async function startCamera(current) {
    current.mode = 'opening';
    current.error = '';
    redraw(current);
    const pending = current.cameraRequest = {};
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (current !== view || current.mode !== 'opening' || current.cameraRequest !== pending) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      camera = stream;
      current.mode = 'camera';
      redraw(current);
      const video = document.querySelector('#capture-video');
      video.srcObject = stream;
      video.addEventListener('loadeddata', () => {
        const shutter = document.querySelector('#capture-shutter');
        if (view === current && camera === stream && shutter) {
          shutter.disabled = false;
          shutter.focus({ preventScroll: true });
        }
      }, { once: true });
      await video.play();
    } catch {
      if (current !== view || current.cameraRequest !== pending || !['opening', 'camera'].includes(current.mode)) return;
      stopCamera();
      Object.assign(current, { mode: 'idle', native: true, error: '相机未能打开。请允许相机权限，或用手机相机拍照、从相册选择。' });
      redraw(current);
    }
  }

  function takePhoto(current) {
    const video = document.querySelector('#capture-video');
    try {
      current.photo = compressPhoto(video, video.videoWidth, video.videoHeight);
      current.source = 'camera';
      current.mode = 'review';
      stopCamera();
      redraw(current, '#record-scene');
    } catch (error) {
      notify(error.message);
    }
  }

  async function readFile(field) {
    const current = view;
    if (current?.route !== 'capture' || current.mode !== 'idle' || !field.files.length) return;
    const file = field.files[0];
    const pending = current.fileRequest = {};
    Object.assign(current, { mode: 'reading', error: '' });
    redraw(current);
    try {
      const photo = await readDevicePhoto(file);
      if (current !== view || current.mode !== 'reading' || current.fileRequest !== pending) return;
      Object.assign(current, { mode: 'review', photo, source: field.id === 'capture-native' ? 'camera' : 'album' });
      redraw(current, '#record-scene');
    } catch (error) {
      if (current !== view || current.mode !== 'reading' || current.fileRequest !== pending) return;
      Object.assign(current, { mode: 'idle', error: error.message || '无法读取这张照片，请换一张。' });
      redraw(current);
    }
  }

  async function save(data) {
    const current = view;
    if (current?.mode !== 'review') return;
    Object.assign(current, { mode: 'saving', scene: data.get('scene'), note: data.get('note').trim(), error: '' });
    redraw(current);
    try {
      const { record } = await api('/api/records', 'POST', { scene: current.scene, note: current.note, photo: current.photo, source: current.source });
      if (view !== current) return;
      location.hash = `#/record/${record.id}`;
      notify('现场照片已存入您的账户。');
    } catch (error) {
      Object.assign(current, { mode: 'review', error: error.message });
      redraw(current, '#capture-save');
    }
  }

  async function action(name, button) {
    const current = view;
    if (!current) return;
    switch (name) {
      case 'capture-open': await startCamera(current); break;
      case 'capture-shutter': takePhoto(current); break;
      case 'capture-reset': reset(current); break;
      case 'capture-retry':
        Object.assign(current, { loading: true, error: '' });
        redraw(current);
        await load(current);
        break;
      case 'capture-delete':
        showDialog('删除这条记录？', '<p class="form-help">这张照片和备注会一起删除。</p><div class="dialog-actions"><button class="button quiet" type="button" data-action="close">取消</button><button class="button danger" type="button" data-action="capture-confirm-delete">删除</button></div>');
        break;
      case 'capture-confirm-delete':
        button.disabled = true;
        try {
          await api(`/api/records/${encodeURIComponent(current.id)}`, 'DELETE');
          if (view !== current) return;
          closeDialog();
          location.hash = '#/records';
          notify('现场记录已删除。');
        } catch (error) {
          if (view !== current) return;
          closeDialog();
          current.error = error.message;
          redraw(current);
        }
        break;
    }
  }

  return { open, close, stopCamera, action, readFile, save, captureScreen, recordsScreen, recordScreen };
}
