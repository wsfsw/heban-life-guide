import {
  personas, speechRates, newState, localDate, localTime, formatWhen, inactiveDays,
  reminderOrder, finishReminder, parseReminder, exampleQuestions, calendarFile, familyPermission,
} from './logic.js';
import { deviceLessons, readDevicePhoto } from './devices.js';
import { lifeGuides, readGuideRun, setGuideScreen, previousGuideScreen } from './guides.js';
import { api, photoUrl, connectCloud, saveCloud, flushCloud, unsyncedCloud } from './cloud.js';
import { createRecords } from './records.js';
import { signInWithDevice } from './sign-in.js';
import { askAssistant, directAssistantUrl } from './assistant-client.js';
import { cleanShortcut, defaultShortcuts, shortcutOptions } from './shortcuts.js';
import { createElectricityCards } from './electricity.js';
import { createPhoneGuide, phoneTopic } from './phone-guide.js';

const app = document.querySelector('#app');
const cloudSite = document.querySelector('meta[name="heban-cloud-site"]')?.content;
const dialog = document.querySelector('#dialog');
const status = document.querySelector('#status');
const accountBar = document.querySelector('#account-bar');
const recordRoutes = ['capture', 'records', 'record'];
const electricityRoutes = ['electricity-cards', 'electricity-editor', 'electricity-card'];
const routes = ['elder', 'family', 'chat', 'ask', 'reminders', 'family-chat', 'family-reminders', 'family-shortcuts', 'home-shortcuts', 'family-overview', 'devices', 'device', 'family-devices', 'device-editor', 'guides', 'guide', 'connections', 'shared-device', 'assistant-settings', 'mine', ...recordRoutes, ...electricityRoutes];
const familyPages = ['elder', 'home-shortcuts', 'family-shortcuts', 'family-overview', 'connections', 'shared-device', 'electricity-cards'];
const pendingReplies = new Map();
const failedReplies = new Map();
const elderRoutes = ['elder', 'home-shortcuts', 'chat', 'ask', 'reminders', 'devices', 'device', 'guides', 'guide', 'shared-device', 'assistant-settings', 'mine', 'electricity-card', ...recordRoutes];
const voices = window.SpeechRecognition || window.webkitSpeechRecognition;
const androidRelease = '0.5';
const installedAndroid = navigator.userAgent.match(/\bHebanAndroid\/([\d.]+)/)?.[1];
const longDate = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
const repeats = { never: '只提醒一次', daily: '每天提醒', weekly: '每周提醒' };
const symbol = {
  home: '<path d="M3 10.8 10.3 4.5a2.6 2.6 0 0 1 3.4 0L21 10.8M4.8 9.4v9.1a2 2 0 0 0 2 2h10.4a2 2 0 0 0 2-2V9.4"/><path fill="currentColor" stroke-width="1.1" d="M12 16.8 9 14a1.8 1.8 0 0 1 2.5-2.6l.5.5.5-.5A1.8 1.8 0 0 1 15 14z"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2zm2-6a4 4 0 0 1 4 4v2m-4-17a4 4 0 0 1 0 8"/><circle cx="9" cy="8" r="4"/>',
  heart: '<path d="M20.8 5.8a4.8 4.8 0 0 0-6.8 0l-2 2-2-2a4.8 4.8 0 0 0-6.8 6.8l8.8 8.5 8.8-8.5a4.8 4.8 0 0 0 0-6.8z"/>',
  bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0M12 1v2"/>',
  question: '<circle cx="12" cy="12" r="9.5"/><path d="M9 9a3 3 0 1 1 4.4 2.7c-.9.5-1.4 1.1-1.4 2.3m0 3h.01"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  right: '<path d="m9 5 7 7-7 7"/>', back: '<path d="m15 5-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chat: '<path d="M21 11.6a9 8 0 0 1-9 8 11 11 0 0 1-3.5-.6l-4 2 1-4a7.7 7.7 0 0 1-2.5-5.4 9 8 0 0 1 18 0zM8 12h.01m4 0h.01m4 0h.01"/>',
  phone: '<path d="M8 3H5a2 2 0 0 0-2 2c0 8.8 7.2 16 16 16a2 2 0 0 0 2-2v-3l-5-2-2 2a13 13 0 0 1-6-6l2-2z"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10a7 7 0 1 0 14 0m-7 7v5m-3 0h6"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4zm4 4a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>',
  tune: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="2" fill="var(--paper)"/><circle cx="16" cy="17" r="2" fill="var(--paper)"/>',
  check: '<path d="m5 12 5 5 9-10"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  remote: '<rect x="7" y="2" width="10" height="20" rx="3"/><path d="M12 6v.01M10 11h4m-2 5v2m-1-1h2"/>',
  washer: '<rect x="3" y="2" width="18" height="20" rx="3"/><path d="M3 7h18M7 4.5h.01m4 0h.01"/><circle cx="12" cy="14" r="4"/>',
  cooker: '<rect x="3" y="8" width="18" height="12" rx="4"/><path d="M8 8V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m-7 5h6m-4 4h2"/>',
  photo: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="1.5"/><path d="m3 17 5-4 4 3 4-6 5 5"/>',
  camera: '<path d="M8 6 9.4 4h5.2L16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="3.1"/>',
  parcel: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18m-12-2h6m-4 7h2"/>',
  bill: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6m-6 4h6m-6 4h4"/>',
};
const icon = (name, size = 24) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbol[name]}</svg>`;
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const records = createRecords({ paint: render, pageHeader, escapeHtml, icon, showDialog, closeDialog: () => dialog.close(), notify, isGuest: () => account?.guest });
const electricity = createElectricityCards({ api, escapeHtml, pageHeader, loginAction, render, speak, stopSpeech, account: () => account, family: () => family });
const phoneGuide = createPhoneGuide({ caption: document.querySelector('#phone-caption'), api: askAssistant, esc: escapeHtml, render,
  speak: (text, status) => speak(text, state.speechRate, true, status), stopSpeech });

let state = newState();
let route = readRoute();
let returnFocus = null;
let statusTimer;
let demoLastSeen = null;
let recognition;
let speechQueue;
let deviceStep = 0;
let deviceEditor = null;
let account = null;
let family = null;
let familyError = '';
let familyBusy = false;
let overview = null;
let cloudStatus = 'saving';
let invite = null;
let authMode = '';
let authPanel = false;
let formMode = '';
let authBusy = false;
const legacySignIn = '/signin-with-chatgpt?return_to=%2F%23%2Flegacy';

function accessPreference(value) {
  try {
    if (value === undefined) return localStorage.getItem('heban-access');
    localStorage.setItem('heban-access', value);
  } catch { /* Permission to use persistent storage is optional for guests. */ }
}

function loginAction(label = '用邮箱登录', classes = 'button', destination = '') {
  return cloudSite
    ? `<a class="${classes}" href="${escapeHtml(destination ? new URL(`#/${destination}`, cloudSite).href : cloudSite)}">打开云端版</a>`
    : `<button class="${classes}" data-action="show-login" type="button">${label}</button>`;
}

function updateCloudStatus(current, detail = '') {
  cloudStatus = current;
  if (!account || authPanel) return;
  accountBar.dataset.state = current;
  const text = { saving: '正在保存', saved: account.guest ? account.temporary ? '本次访问有效' : '已保存到本机' : '已云端保存', error: '保存失败', conflict: '另一台设备有更新', auth: '登录已失效' };
  accountBar.hidden = false;
  accountBar.innerHTML = `<div>${account.guest ? `<span>游客</span>${loginAction('用邮箱登录', 'text-button')}` : `<a href="#/connections">${escapeHtml(account.name)}</a>`}<span class="sync-label" role="status">${text[current]}</span></div>
    ${current === 'error' ? '<button type="button" class="text-button" data-action="cloud-retry">重试保存</button>' : ''}
    ${current === 'conflict' ? '<button type="button" class="text-button" data-action="cloud-refresh">读取云端</button>' : ''}
    ${current === 'auth' ? '<button type="button" class="text-button" data-action="show-login">重新登录</button>' : ''}
    ${['error','conflict','auth'].includes(current) && detail ? `<p>${escapeHtml(detail)}</p>` : ''}`;
}

function save() {
  return saveCloud(state);
}

function readRoute() {
  const value = location.hash.slice(2).split('/')[0];
  return routes.includes(value) ? value : 'elder';
}

const routeDeviceId = () => location.hash.split('/')[2];

function notify(message) {
  clearTimeout(statusTimer);
  status.textContent = message.includes('已保存') && cloudStatus !== 'saved' ? account?.guest ? '正在保存到本机。' : '正在保存到云端。' : message;
  status.classList.add('visible');
  statusTimer = window.setTimeout(() => status.classList.remove('visible'), 3700);
}

function noteActivity() {
  if (account && (state.monitoring || state.familyVisibility.some((item) => item.activity))
    && elderRoutes.includes(route) && document.visibilityState === 'visible') {
    state.lastSeen = Date.now();
    save();
  }
}

function stopSpeech() {
  clearTimeout(speechQueue?.startTimer);
  speechQueue = null;
  const engine = window.speechSynthesis;
  if (engine?.speaking || engine?.pending) engine.cancel();
}

function speak(text, rate = state.speechRate, manual = true, onStatus) {
  if (!text?.trim()) return;
  const engine = window.speechSynthesis;
  const Utterance = window.SpeechSynthesisUtterance;
  if (!engine || !Utterance) {
    notify('当前浏览器不提供朗读。请用手机自带的浏览器打开禾伴。');
    onStatus?.('error');
    return;
  }
  stopSpeech();
  const chunks = text.trim().match(/[^。！？\n]{1,100}[。！？\n]*|[。！？\n]+/gu);
  const zhVoices = (engine.getVoices?.() ?? []).filter((voice) => /^(zh|cmn)(?:[-_]|$)/i.test(voice.lang));
  const mandarin = zhVoices.filter((voice) => !/[-_](hk|mo|yue)(?:[-_]|$)/i.test(voice.lang));
  const voice = mandarin.find((item) => item.localService && /(?:[-_]cn|hans)/i.test(item.lang))
    ?? mandarin.find((item) => item.localService) ?? mandarin[0] ?? zhVoices[0];
  const queue = { utterance: null, startTimer: null };
  speechQueue = queue;
  function failure(error) {
    if (speechQueue !== queue) return;
    stopSpeech();
    if (error === 'canceled' || error === 'interrupted') { onStatus?.('ended'); return; }
    onStatus?.('error');
    notify(!manual ? '自动朗读未启动。请点回复下方的「朗读」。'
      : error === 'voice-unavailable' || error === 'language-unavailable' ? '这台手机缺少中文语音。请在手机系统里添加中文语音。'
      : '没有开始朗读。请检查媒体音量，或用手机自带的浏览器打开禾伴。');
  }
  function next() {
    if (speechQueue !== queue) return;
    clearTimeout(queue.startTimer);
    const part = chunks.shift();
    if (!part) { speechQueue = null; onStatus?.('ended'); return; }
    const item = new Utterance(part);
    item.lang = voice?.lang ?? 'zh-CN';
    if (voice) item.voice = voice;
    item.rate = speechRates[rate]?.value ?? speechRates.normal.value;
    item.onstart = () => {
      if (speechQueue !== queue) return;
      clearTimeout(queue.startTimer);
      onStatus?.('playing');
    };
    item.onend = next;
    item.onerror = (event) => failure(event.error);
    queue.utterance = item;
    queue.startTimer = setTimeout(() => failure('timeout'), 4500);
    try {
      if (engine.paused) engine.resume();
      engine.speak(item);
    } catch { failure('exception'); }
  }
  next();
}

const settings = (back = 'ask') => `<a class="icon-button" href="#/assistant-settings/${back}" aria-label="助手设置">${icon('tune', 23)}</a>`;
function homeHeader(owner) {
  const isFamily = owner === 'family';
  return `<header class="topbar home-bar"><a class="brand" href="#/${owner}"><span class="brand-mark">${icon('home', 25)}</span><span>禾伴</span></a>
    <div class="toolbar">${isFamily ? '' : settings('elder')}
      <a class="role-link" href="#/${isFamily ? 'elder' : 'family'}">${icon('people', 22)}${isFamily ? '长辈端' : '家属端'}</a>
    </div></header>`;
}

function pageHeader(title, owner, extra = '') {
  const backLabel = { family: '家属端', devices: '家电怎么用', 'family-devices': '设备卡列表', guides: '「跟着做」', connections: '家庭连接', ask: '问问助手', chat: '聊天', mine: '我的', records: '我的记录', 'guide/parcel': '快递柜取件', 'guide/bill': '查电费账单' }[owner] ?? '首页';
  return `<header class="topbar subbar"><a class="icon-button" href="#/${owner}" aria-label="返回${backLabel}">${icon('back')}</a><h1 id="screen-title" tabindex="-1">${title}</h1>${extra}<span class="subbar-space" aria-hidden="true"></span></header>`;
}

function tile({ link, action, title, subtitle, glyph, tone = 'sage', prominent = false, id }) {
  const tag = link ? 'a' : 'button';
  const attrs = link ? `href="#/${link}"` : `type="button" data-action="${action}"`;
  return `<${tag} class="tile ${prominent ? 'tile-prominent' : ''}" ${attrs}${id ? ` data-id="${id}"` : ''}>
    <span class="tile-icon ${tone}">${icon(glyph, 30)}</span><span class="tile-text"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></span>${icon('right', 23)}</${tag}>`;
}

const quickCards = [
  { key: 'ask', ...shortcutOptions.ask, subtitle: '可以说话，也可以打字', color: 'blue' },
  { key: 'parcel', ...shortcutOptions.parcel, subtitle: '找取件码，学着开柜门', color: 'peach' },
  { key: 'bill', ...shortcutOptions.bill, subtitle: '看看这期要交多少钱', color: 'lilac' },
  { key: 'devices', ...shortcutOptions.devices, subtitle: '看图找按键', color: 'mint' },
];

function featureCard({ link, title, subtitle, glyph, color = 'blue', external = false }) {
  return `<a class="feature-card tone-${color}" href="${escapeHtml(external ? link : '#/' + link)}" ${external ? 'target="_blank" rel="noopener noreferrer"' : ''}>
    <span class="feature-icon">${icon(glyph, 28)}</span>
    <span class="feature-text"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></span>
  </a>`;
}

function addedHomeShortcuts() {
  const items = [...state.shortcuts, ...(family?.shortcuts?.filter((item) => item.direction === 'received') ?? [])];
  const seen = new Set();
  return items.flatMap((item) => {
    const entry = cleanShortcut(item);
    if (!entry || seen.has(entry.kind + entry.target)) return [];
    seen.add(entry.kind + entry.target);
    const description = item.name ? `${item.name}添加` : '家属端添加';
    const info = { id: item.id, place: item.direction === 'received' ? 'remote' : 'local', title: entry.title };
    if (entry.kind === 'built-in') return [{ ...shortcutOptions[entry.target], ...info, key: entry.target, subtitle: description, color: 'lilac' }];
    return [{ ...info, link: entry.target, subtitle: new URL(entry.target).hostname, glyph: 'question', color: 'mint', external: true }];
  });
}

function visibleDefaults(added) {
  return defaultShortcuts.filter((key) => !state.hiddenShortcuts.includes(key) && !added.some((item) => item.key === key));
}

function homeShortcutsScreen() {
  const added = addedHomeShortcuts();
  const defaults = visibleDefaults(added).map((key) => ({ ...shortcutOptions[key], key, place: 'default' }));
  const rows = [...defaults, ...added, ...electricity.homeEntries()];
  const hiddenCards = electricity.hiddenEntries();
  const hidden = state.hiddenShortcuts.filter((key) => !added.some((item) => item.key === key));
  return `${pageHeader('管理常用功能', 'elder')}<main class="surface shortcut-screen">
    <p class="device-help">删除后，该入口会从首页移除。原来的提醒、照片和使用记录仍可查看。</p>
    <section class="shortcut-items"><h2>首页上的功能</h2>
      ${rows.length ? `<ul class="record-list">${rows.map((item) => `<li class="shortcut-row"><div><strong>${escapeHtml(item.title)}</strong>${item.subtitle ? `<span>${escapeHtml(item.subtitle)}</span>` : ''}</div>
        <button class="button quiet" type="button" data-action="${item.place === 'electricity' ? 'hide-electricity' : 'remove-shortcut'}" data-id="${escapeHtml(item.id ?? '')}" data-place="${item.place}" data-key="${escapeHtml(item.key ?? '')}" aria-label="删除${escapeHtml(item.title)}入口">删除</button></li>`).join('')}</ul>` : '<p class="empty-card">首页暂时没有常用入口。</p>'}</section>
    ${hidden.length ? `<section class="shortcut-items"><h2>可恢复的默认入口</h2><ul class="record-list">${hidden.map((key) => `<li class="shortcut-row"><strong>${escapeHtml(shortcutOptions[key].title)}</strong><button class="button quiet" type="button" data-action="restore-shortcut" data-key="${key}">恢复</button></li>`).join('')}</ul></section>` : ''}
    ${hiddenCards.length ? `<section class="shortcut-items"><h2>可恢复的操作卡</h2><ul class="record-list">${hiddenCards.map((item) => `<li class="shortcut-row"><strong>${escapeHtml(item.title)}</strong><button class="button quiet" type="button" data-action="restore-electricity" data-id="${escapeHtml(item.id)}">恢复</button></li>`).join('')}</ul></section>` : ''}
  </main>`;
}

function elderHome() {
  const next = reminderOrder(state.reminders, 'elder').find((item) => !item.done && item.at > Date.now());
  const added = addedHomeShortcuts();
  const defaults = visibleDefaults(added);
  const featured = [...electricity.homeEntries(), ...quickCards.filter((item) => defaults.includes(item.key)), ...added];
  return `${homeHeader('elder')}<main class="surface home-screen">
    <div class="home-heading"><h1 id="screen-title" tabindex="-1">生活帮手</h1><p class="date">${longDate.format(new Date())}</p></div>
    <section class="feature-banner home-capture" aria-labelledby="capture-home-title">
      <div class="banner-copy"><h2 id="capture-home-title">不知道按哪个键？</h2><p>拍下按键或屏幕，看看下一步怎么做。</p>
      <a class="button home-camera-button" href="#/capture/other/home">${icon('camera', 23)}拍照问一问</a></div>
      <img src="./assets/guide-kit.webp" width="520" height="434" alt="" fetchpriority="high">
    </section>
    <section class="tool-section" aria-labelledby="home-tools-title">
      <div class="section-heading"><h2 id="home-tools-title">常用功能</h2><div class="section-actions"><a class="section-link" href="#/records">我的记录</a><a class="section-link" href="#/home-shortcuts">管理</a></div></div>
      ${featured.length ? `<div class="feature-grid">${featured.map(featureCard).join('')}</div>` : defaults.includes('reminders') ? '' : '<p class="empty-card">还没有常用入口。</p>'}
    </section>
    ${defaults.includes('reminders') ? `<div class="app-list home-shortcuts">
      ${tile({ link: 'reminders', title: '设个提醒', subtitle: next ? `${formatWhen(next.at)}　${next.title}` : '记下买菜、出门的时间', glyph: 'bell' })}
    </div>` : ''}
  </main>`;
}

function bottomNav() {
  const tabs = [
    { link: 'elder', label: '首页', glyph: 'home', pages: ['elder', 'home-shortcuts', 'electricity-card'] },
    { link: 'ask', label: '助手', glyph: 'chat', pages: ['ask', 'chat', 'assistant-settings', 'capture'] },
    { link: 'guides', label: '跟着做', glyph: 'bill', pages: ['guides', 'guide', 'devices', 'device'] },
    { link: 'mine', label: '我的', glyph: 'people' },
  ];
  const selected = tabs.find((tab) => tab.pages?.includes(route))?.link ?? 'mine';
  return `<nav class="app-nav" aria-label="主导航">${tabs.map(({ link, label, glyph }) => `
    <a href="#/${link}" ${selected === link ? 'aria-current="page"' : ''}><span>${icon(glyph, 24)}</span>${label}</a>`).join('')}
  </nav>`;
}

function mineScreen() {
  return `${pageHeader('我的', 'elder')}<main class="surface mine-screen">
    <div class="profile-card tone-blue"><span class="feature-icon">${icon('people', 28)}</span>
      <div><h2>${escapeHtml(account.name)}</h2><p>${account.guest ? account.temporary ? '本次浏览可用' : '记录保存在当前浏览器' : '记录保存到云端'}</p></div>
      ${account.guest ? loginAction('登录') : '<button class="button quiet" data-action="account-signout" type="button">退出登录</button>'}
    </div>
    <section class="profile-card tone-blue" aria-labelledby="android-download-title">
      <div><h2 id="android-download-title">禾伴安卓安装包</h2><p>版本 ${androidRelease} · 支持跨应用屏幕引导</p>
        ${installedAndroid ? `<p>当前已安装 ${installedAndroid}${installedAndroid === androidRelease ? '' : '。点上方「用浏览器打开」可以下载新版。'}</p>` : ''}
      </div>
      ${installedAndroid ? '' : `<a class="button" href="./heban-screen-guide.apk?v=${androidRelease}" download="Heban-${androidRelease}.apk">下载安装包</a>`}
    </section>
    <div class="app-list">
      ${tile({ link: 'records', title: '我的记录', subtitle: '看看存下的照片', glyph: 'photo' })}
      ${tile({ link: 'reminders', title: '我的提醒', subtitle: '看时间，也可以改时间', glyph: 'bell' })}
      ${tile({ link: 'assistant-settings/mine', title: '助手设置', subtitle: '可以让助手读慢一点', glyph: 'tune' })}
      ${tile({ link: 'connections', title: '和家人分享', subtitle: '选择家人能看到的内容', glyph: 'people' })}
      ${tile({ link: 'family', title: '家属端', subtitle: '联系家人、制作设备卡', glyph: 'heart' })}
    </div>
  </main>`;
}

function familyHome() {
  const seen = demoLastSeen ?? state.lastSeen;
  const days = inactiveDays(seen);
  const overdue = (state.monitoring || demoLastSeen !== null) && seen && days >= state.quietDays;
  const activity = overdue ? `已经 ${days} 天没有打开长辈端，方便时打个电话问候。`
    : !state.monitoring && !demoLastSeen ? '长辈同意后，可以开启未使用提醒。'
    : !seen ? '等待长辈第一次使用。' : `最近使用：${formatWhen(seen)}`;
  const callReminder = reminderOrder(state.reminders, 'family').find((item) => !item.done && item.at > Date.now());
  const phoneAction = state.phone ? `<a class="button small" href="tel:${escapeHtml(state.phone)}">${icon('phone', 19)}去拨打</a>` : '<button class="button small" data-action="contact" type="button">设置号码</button>';
  return `${homeHeader('family')}<main class="surface family-screen"><h1 id="screen-title" tabindex="-1">家人关怀</h1>
    <button class="care-card ${overdue ? 'care-warn' : ''}" type="button" data-action="care"><span class="care-icon">${icon('heart', 42)}</span>
      <span><strong>${demoLastSeen ? '本机提醒演示' : '本机关怀设置'}</strong><span>${activity}</span></span>${icon('right', 22)}</button>
    <div class="contact-card"><span class="tile-icon apricot">${icon('phone', 30)}</span><span class="tile-text"><strong>给${escapeHtml(state.contactName)}打电话</strong><span>${callReminder ? `${formatWhen(callReminder.at)} 有联系提醒` : '选个时间，打个电话'}</span></span>${phoneAction}</div>
    <div class="feature-grid family-tools">
      ${featureCard({ link: 'electricity-cards', title: '查电费操作卡', subtitle: electricity.needsHelp() ? '有操作卡需要修改' : '圈出位置，录一句话', glyph: 'bill', color: 'mint' })}
      ${featureCard({ link: 'connections', title: '家庭连接', subtitle: '连接家人和查看分享', glyph: 'people', color: 'blue' })}
      ${featureCard({ link: 'family-overview', title: '长辈聊天和近况', subtitle: '查看长辈同意分享的内容', glyph: 'heart', color: 'peach' })}
      ${featureCard({ link: 'family-reminders', title: '联系提醒', subtitle: '记下打电话的时间', glyph: 'calendar', color: 'peach' })}
      ${featureCard({ link: 'family-devices', title: '制作设备卡', subtitle: '在照片上标出按键', glyph: 'photo', color: 'mint' })}
      ${featureCard({ link: 'family-chat', title: '跟助手聊聊', subtitle: '聊聊怎么关心家人', glyph: 'chat', color: 'lilac' })}
      ${featureCard({ link: 'family-shortcuts', title: '长辈端常用功能', subtitle: '添加功能或网页入口', glyph: 'plus', color: 'blue' })}
    </div>
    ${state.phone ? '<button class="text-button" type="button" data-action="contact">修改联系人号码</button>' : ''}
  </main>`;
}

function familyShortcutsScreen() {
  const head = pageHeader('长辈端常用功能', 'family');
  if (!account.guest && !family && !familyError) return `${head}<main class="surface"><p class="empty-card" role="status">正在读取家人和功能…</p></main>`;
  const links = family?.links ?? [];
  const items = [...state.shortcuts, ...(family?.shortcuts?.filter((item) => item.direction === 'sent') ?? [])];
  const catalog = Object.entries(shortcutOptions);
  const options = (group) => catalog.filter(([, item]) => item.group === group).map(([key, item]) => `<option value="${key}">${item.title}</option>`).join('');
  return `${head}<main class="surface shortcut-screen">
    <form class="shortcut-form" data-form="family-shortcut">
      <h2>添加一个功能</h2>
      <a class="section-link" href="#/electricity-cards">给家人制作查电费操作卡</a>
      <label for="shortcut-recipient">加给谁？</label>
      <select id="shortcut-recipient" name="recipient" required>${links.length > 1 ? '<option value="">请选择一位家人</option>' : ''}
        ${links.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}的首页</option>`).join('')}
        <option value="local">${account.guest ? '这个浏览器的长辈首页' : '自己的长辈首页'}</option></select>
      ${!links.length ? `<p class="form-help">想添加到家人手机的首页？先完成家庭连接。 ${account.guest ? loginAction('用邮箱登录', 'section-link', 'family-shortcuts') : '<a class="section-link" href="#/connections">去连接家人</a>'}</p>` : ''}
      <label for="shortcut-kind">要添加什么？</label>
      <select id="shortcut-kind" name="kind" required>
        <option value="">请选择一个功能</option>
        <optgroup label="生活步骤">${options('生活步骤')}</optgroup>
        <optgroup label="家电步骤">${options('家电步骤')}</optgroup>
        <optgroup label="其他功能">${options(undefined)}</optgroup>
        <option value="website">自定义网页</option>
      </select>
      <label for="shortcut-title">在首页显示的名字</label><input id="shortcut-title" name="title" maxlength="24" placeholder="选填，留空就用功能名称">
      <div class="shortcut-custom" data-shortcut-custom hidden>
        <label for="shortcut-url">网页地址</label><input id="shortcut-url" name="target" type="url" inputmode="url" maxlength="500" placeholder="https://" disabled>
      </div>
  <p class="form-error" role="alert">${escapeHtml(familyError)}</p>
      <button class="button" type="submit">${icon('plus', 21)}添加到长辈端</button>
    </form>
    <section class="shortcut-items"><h2>已添加</h2>
      ${items.length ? `<ul class="record-list">${items.map((item) => `
        <li class="shortcut-row"><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.name || '本机长辈端')}</span></div>
          <button class="button quiet" type="button" data-action="remove-shortcut" data-id="${escapeHtml(item.id)}" data-place="${item.direction === 'sent' ? 'remote' : 'local'}" aria-label="移除${escapeHtml(item.title)}">移除</button></li>`).join('')}</ul>` : '<p class="empty-card">还没有新增入口。</p>'}</section>
  </main>`;
}

async function submitShortcut(form, data) {
  const kind = data.get('kind');
  const shortcut = cleanShortcut(kind === 'website'
    ? { kind, title: data.get('title'), target: data.get('target') }
    : { kind: 'built-in', target: kind, title: data.get('title') });
  const error = form.querySelector('.form-error');
  if (!shortcut) { error.textContent = kind === 'website' ? '请填写名称和以 https:// 开头的网页地址。' : '请选择要添加的功能。'; return; }
  const recipient = data.get('recipient');
  if (!recipient) { error.textContent = '请选择加到谁的首页。'; return; }
  if (recipient === 'local') {
    if (state.shortcuts.some((item) => item.kind === shortcut.kind && item.target === shortcut.target)) { error.textContent = '这个入口已经添加过。'; return; }
    if (state.shortcuts.length >= 12) { error.textContent = '最多可添加 12 个入口，请先移除一项。'; return; }
    state.shortcuts.push({ id: crypto.randomUUID(), ...shortcut });
    refresh('已添加到长辈端。');
    return;
  }
  const active = account;
  const button = form.querySelector('[type=submit]');
  button.disabled = true;
  try {
    const result = await api('/api/family/shortcuts', 'POST', { recipient, ...shortcut });
    if (account !== active) return;
    family = result;
    if (route === 'family-shortcuts') render();
    notify('已添加到家人的长辈端。');
  } catch (failure) { error.textContent = failure.message; }
  finally { button.disabled = false; }
}

async function removeShortcut(button) {
  const { id, place, key } = button.dataset;
  const hideDefault = route === 'home-shortcuts' && defaultShortcuts.includes(key);
  function updateHiddenDefaults() {
    if (hideDefault && !state.hiddenShortcuts.includes(key)) state.hiddenShortcuts.push(key);
  }
  if (place === 'default') {
    updateHiddenDefaults();
    refresh('已从首页删除。');
    return;
  }
  if (place === 'local') {
    state.shortcuts = state.shortcuts.filter((item) => item.id !== id);
    updateHiddenDefaults();
    refresh('功能入口已移除。');
    return;
  }
  const active = account;
  button.disabled = true;
  try {
    const result = await api(`/api/family/shortcuts/${encodeURIComponent(id)}`, 'DELETE');
    if (account !== active) return;
    family = result;
    if (hideDefault) { updateHiddenDefaults(); save(); }
    if (['family-shortcuts', 'home-shortcuts', 'elder'].includes(route)) render();
    notify('功能入口已移除。');
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
}

const chatConfig = {
  chat: { title: '聊聊天', examples: ['今天想聊聊天', '附近有什么社区活动？', '明天下午三点提醒我浇花'], greeting: '您好，我是{name}。您可以和我说说今天过得怎么样，也可以让我帮您记一件要做的事。' },
  ask: { title: '问问助手', examples: exampleQuestions, greeting: '遇到不会用的手机功能或家电，可以在这儿问。比如「怎么看电费账单？」' },
  'family-chat': { title: '跟助手聊聊', examples: ['怎么和爸妈打开话题？', '明天晚上八点提醒我给爸妈打电话'], greeting: '您好，我是{name}。您可以问我怎么和长辈聊聊，也可以设置一个联系提醒。' },
};

function chatScreen(mode) {
  const config = chatConfig[mode];
  const waiting = pendingReplies.get(mode) === account;
  const failure = failedReplies.get(mode);
  const direct = failure?.error.canOpenDirect && failure.account === account ? directAssistantUrl(mode) : '';
  const interest = mode === 'chat' ? state.interests.split(/[、，,\s]+/).find(Boolean) : '';
  const greeting = config.greeting.replace('{name}', state.persona) + (interest ? `也可以聊聊您喜欢的「${interest.slice(0, 24)}」。` : '');
  const messages = [{ role: 'assistant', text: greeting }, ...state.messages[mode]];
  const toggle = `<button class="listen" data-action="listen" type="button" aria-pressed="${state.listen}">${icon('sound', 20)}听回复<span class="switch" aria-hidden="true"></span></button>`;
  const familyMode = mode === 'family-chat';
  return `${pageHeader(config.title, familyMode ? 'family' : 'elder', `<div class="toolbar chat-controls">${toggle}${familyMode ? '' : settings(mode)}</div>`)}<main class="surface conversation" data-mode="${mode}">
    ${familyMode ? '' : `<nav class="assistant-tabs" aria-label="助手功能"><a href="#/ask" ${mode === 'ask' ? 'aria-current="page"' : ''}>问怎么用</a><a href="#/chat" ${mode === 'chat' ? 'aria-current="page"' : ''}>聊聊天</a></nav>
      <div class="assistant-tools" aria-label="助手工具">
        ${featureCard({ link: 'capture', title: '拍照问一问', subtitle: '拍下按键或屏幕', glyph: 'camera', color: 'blue' })}
        ${featureCard({ link: 'records', title: '我的记录', subtitle: '看存下的照片', glyph: 'photo', color: 'lilac' })}
      </div>`}
    <div class="message-list" role="log" aria-label="聊天记录">${renderChatMessages(messages, mode)}
      ${waiting ? '<p class="assistant-wait" role="status">禾伴正在回答…</p>' : ''}
      ${failure?.account === account ? `<div class="assistant-retry"><p role="alert">${escapeHtml(failure.error.message)}</p>
        <button type="button" class="button quiet" data-action="assistant-retry">再问一次</button>
        ${direct ? `<a class="button quiet" href="${escapeHtml(direct)}" target="_blank" rel="noopener">直接打开助手</a>` : ''}
        ${mode === 'ask' ? '<a class="section-link" href="#/guides">先看操作步骤</a>' : ''}</div>` : ''}
    </div>
    <div class="composer-area">
      <div class="examples" aria-label="常用说法">${config.examples.map((example) => `<button class="example" type="button" data-action="example" data-text="${escapeHtml(example)}" ${waiting ? 'disabled' : ''}>${escapeHtml(example)}</button>`).join('')}</div>
      <form class="composer" data-form="message"><button class="icon-button mic" type="button" data-action="voice" aria-label="用语音输入" ${waiting ? 'disabled' : ''}>${icon('mic', 25)}</button>
      <input id="message-input" name="message" aria-label="想说的话" placeholder="${mode === 'ask' ? '在这里写下您的问题' : '在这里写下您想说的话'}" maxlength="300" autocomplete="off" required ${waiting ? 'disabled' : ''}><button class="button" type="submit" ${waiting ? 'disabled' : ''}>发送</button></form>
      <p class="chat-note">请别发送账号、密码或验证码。在线回复由 DeepSeek 提供。</p>
    </div></main>`;
}

function phoneGuideButton(questionId) {
  const question = state.messages.ask.find((item) => item.role === 'user' && item.id === questionId);
  if (!question) return '';
  const guide = phoneGuide.controls(questionId);
  if (guide) return guide;
  return `${phoneGuide.directLink(question.text, questionId)}<button class="button quiet phone-offer" type="button" data-action="open-phone-guide" data-id="${escapeHtml(questionId)}">${icon('sound', 20)}听着一步一步做</button>`;
}

function renderChatMessages(messages, mode) {
  let question;
  return messages.map((message, index) => {
    if (message.role === 'user') {
      question = message;
      const unanswered = messages[index + 1]?.role !== 'assistant';
      return renderMessage(message, mode === 'ask' && unanswered && phoneTopic(message.text) ? message.id : '');
    }
    const guideId = mode === 'ask' ? message.guideFor || (question && phoneTopic(question.text) ? question.id : '') : '';
    question = null;
    return renderMessage(message, guideId);
  }).join('');
}

function renderMessage(message, guideId = '') {
  const tools = [];
  if (message.role === 'assistant') tools.push(`<button class="message-action" type="button" data-action="read" data-text="${escapeHtml(message.text)}" aria-label="朗读这条回复">${icon('sound', 17)}朗读</button>`);
  if (guideId) tools.push(phoneGuideButton(guideId));
  if (route === 'ask' && message.role === 'user') {
    tools.push(`<button class="message-action" type="button" data-action="share" data-id="${message.id}">分享给家人</button>`);
  }
  const proposal = message.draft;
  if (proposal) {
    const stored = state.reminders.some((item) => item.id === message.id);
    tools.push(stored ? `<span class="recorded">${icon('check', 17)}已保存</span>` : `<button class="message-action" type="button" data-action="draft" data-id="${message.id}">核对并保存提醒</button>`);
  }
  return `<article class="message ${message.role}">${message.role === 'assistant' ? `<span class="message-avatar" aria-hidden="true">${icon('home', 24)}</span>` : ''}<div><p class="bubble">${escapeHtml(message.text)}</p>${tools.length ? `<div class="message-actions">${tools.join('')}</div>` : ''}</div></article>`;
}

function remindersScreen(owner) {
  const family = owner === 'family';
  const items = reminderOrder(state.reminders, owner);
  const examples = family ? ['明天晚上八点提醒我给爸妈打电话'] : ['明天上午八点半提醒我买菜', '下午三点提醒我浇花'];
  return `${pageHeader(family ? '联系提醒' : '我的提醒', owner)}<main class="surface reminder-screen">
    <button class="button new-reminder" type="button" data-action="new-reminder">${icon('plus', 26)}新建提醒</button>
    <h2>提醒列表</h2>
    ${items.length ? `<div class="stack">${items.map((item) => `<button class="tile reminder-row" data-action="edit-reminder" data-id="${item.id}" type="button"><span class="tile-icon apricot">${icon('calendar', 27)}</span><span class="tile-text"><strong>${escapeHtml(item.title)}</strong><span>${formatWhen(item.at)}${item.repeat && item.repeat !== 'never' ? ` · ${repeats[item.repeat]}` : ''}</span></span><span class="badge ${item.done ? 'done' : ''}">${item.done ? '已完成' : item.at <= Date.now() ? '已到时间' : '待完成'}</span>${icon('right', 20)}</button>`).join('')}</div>` : '<p class="empty-card">还没有提醒。点上方的「新建提醒」记下一件事。</p>'}
    <section class="reminder-examples"><h2>一句话就能添加</h2><div class="examples">${examples.map((example) => `<button class="example" data-action="reminder-example" data-text="${escapeHtml(example)}" type="button">${icon('calendar', 19)}${escapeHtml(example)}</button>`).join('')}</div></section>
  </main>`;
}

function devicesScreen() {
  return `${pageHeader('家电怎么用', 'elder')}<main class="surface devices-screen">
    ${state.deviceGuides.length ? `<section aria-labelledby="my-devices"><h2 id="my-devices">我家的设备</h2><div class="stack">${state.deviceGuides.map((guide) => tile({ link: `device/${guide.id}`, title: guide.name, subtitle: '看我家设备的照片', glyph: 'photo' })).join('')}</div></section>` : ''}
    <section aria-labelledby="practice-devices"><h2 id="practice-devices">先在手机上练一练</h2><div class="stack">${deviceLessons.map((lesson) => tile({ link: `device/${lesson.id}`, title: lesson.name, subtitle: lesson.summary, glyph: lesson.icon, tone: lesson.icon === 'washer' ? 'apricot' : 'sage' })).join('')}</div></section>
    <p class="device-help">练完可以对照实物找按键。按键不一样时，可以请家人给这台设备做一张照片指引。</p>
  </main>`;
}

function selectedDevice() {
  const id = routeDeviceId();
  if (route === 'shared-device') {
    const item = family?.items.find((entry) => entry.id === id && entry.kind === 'device');
    return item ? { name: item.payload.title, photo: item.payload.photo, steps: item.payload.steps } : null;
  }
  return deviceLessons.find((lesson) => lesson.id === id) ?? state.deviceGuides.find((guide) => guide.id === id);
}

function pinMarkup(pin) {
  if (!pin) return '';
  return `<span class="photo-pin" style="--left:${pin.x * 100}%;--top:${pin.y * 100}%" aria-hidden="true"></span>`;
}

function photoBoard(photo, name, pin, editable = false) {
  const image = `<img class="device-photo-image" src="${escapeHtml(photoUrl(photo))}" alt="${escapeHtml(name)}的按键照片">${pinMarkup(pin)}`;
  return `<div class="photo-board">${editable ? `<button type="button" data-action="device-pin" class="photo-target" aria-label="在照片上标记按键" aria-describedby="device-pin-help">${image}</button>` : `<div class="photo-target">${image}</div>`}</div>`;
}

function deviceScreen() {
  const device = selectedDevice();
  const shared = route === 'shared-device';
  const back = shared ? 'connections' : 'devices';
  if (!device) return `${pageHeader(shared ? '家人分享的设备' : '家里设备', back)}<main class="surface"><p class="empty-card">${shared && !family && !familyError ? '正在读取分享…' : '找不到这张设备卡。请返回列表重新选择。'}</p></main>`;
  const steps = device.steps;
  const step = steps[deviceStep];
  const complete = !step;
  const sample = Boolean(device.controls);
  const activeKey = sample && step ? device.controls.find(([key]) => key === step.key)?.[1] : '';
  const controls = sample ? `<div class="practice-panel">
    <div class="practice-display" role="status"><span class="practice-indicator" aria-hidden="true"></span>${device.displays[deviceStep]}</div>
    <div class="practice-buttons" aria-label="练习面板">${device.controls.map(([key, name]) => `<button type="button" class="practice-key ${activeKey === name ? 'is-current' : ''}" data-action="device-key" data-key="${key}" ${complete ? 'disabled' : ''}>${escapeHtml(name)}</button>`).join('')}</div>
  </div>` : '';
  const title = sample ? `${device.name}练习` : device.name;
  return `${pageHeader(escapeHtml(title), back)}<main class="surface device-lesson">
    <div class="lesson-progress"><span>${complete ? '已完成' : `第 ${deviceStep + 1} 步，共 ${steps.length} 步`}</span><progress aria-label="操作进度" value="${deviceStep}" max="${steps.length}"></progress></div>
    ${complete ? `<h2 class="device-instruction" id="device-step-heading" tabindex="-1">${sample ? '练习完成' : '全部步骤都看完了'}</h2>` : `<h2 class="device-instruction" id="device-step-heading" tabindex="-1">${escapeHtml(step.text)}</h2><button type="button" class="button quiet listen-step" data-action="read" data-text="${escapeHtml(step.text)}">${icon('sound', 23)}听这一步</button>`}
    ${sample ? controls : (!complete ? photoBoard(device.photo, device.name, step) : '')}
    ${sample && !complete ? '<p class="device-help">在练习面板上点高亮的按键。</p>' : ''}
    <p id="device-feedback" class="form-error" role="status"></p>
    <div class="lesson-actions">
      ${deviceStep > 0 && !complete ? '<button type="button" class="button quiet" data-action="device-previous">上一步</button>' : ''}
      ${!sample && !complete ? `<button type="button" class="button" data-action="device-next">${deviceStep === steps.length - 1 ? '看完了' : '找到了，下一步'}</button>` : ''}
      ${complete ? `<button type="button" class="button quiet" data-action="device-restart">再来一次</button><a class="button" href="#/${back}">${shared ? '返回家庭连接' : '返回设备列表'}</a>` : ''}
    </div>
  </main>`;
}

function familyDevicesScreen() {
  return `${pageHeader('家里的设备卡', 'family')}<main class="surface devices-screen family-devices">
    <p class="device-help">拍清楚设备的按键，你标好位置、写好步骤，长辈端就能照着做。</p>
    <a class="button wide new-device" href="#/device-editor">${icon('plus', 24)}新建设备卡</a>
    ${state.deviceGuides.length ? `<div class="stack">${state.deviceGuides.map((guide) => tile({ link: `device-editor/${guide.id}`, title: guide.name, subtitle: `${guide.steps.length} 步 · 可修改`, glyph: 'photo' })).join('')}</div>` : '<p class="empty-card">可以从长辈最常用的一件设备开始。</p>'}
  </main>`;
}

function editorStepRows() {
  return deviceEditor.steps.length ? deviceEditor.steps.map((step, index) => `<li><span>${escapeHtml(step.text)}${step.x === null ? '<small>请重新标记位置</small>' : ''}</span><button type="button" class="text-button" data-action="device-edit-step" data-index="${index}" aria-label="修改第 ${index + 1} 步">修改</button><button type="button" class="text-button remove-step" data-action="device-remove-step" data-index="${index}" aria-label="移除第 ${index + 1} 步">移除</button></li>`).join('') : '<li class="empty-step">还没添加步骤。</li>';
}

function editorPhotoContent(name = '家里的设备') {
  return deviceEditor.photo ? photoBoard(deviceEditor.photo, name, deviceEditor.pin, true)
    : `<p class="photo-empty">${icon('photo', 28)}请选择一张能看清按键的照片。</p>`;
}

function deviceEditorScreen() {
  if (!deviceEditor) return `${pageHeader('设备卡', 'family-devices')}<main class="surface"><p class="empty-card">找不到要修改的设备卡。</p></main>`;
  const { name, id, loading, stepIndex } = deviceEditor;
  return `${pageHeader(id ? '修改设备卡' : '新建设备卡', 'family-devices')}<main class="surface guide-editor">
    <form data-form="device-guide">
      <label for="device-name">设备叫什么？</label><input id="device-name" name="name" maxlength="26" placeholder="如：客厅电视遥控器" value="${escapeHtml(name)}" required>
      <label for="device-file">拍一张按键照片</label><input id="device-file" type="file" accept="image/jpeg,image/png,image/webp" ${loading ? 'disabled' : ''}>
      <div id="guide-photo">${editorPhotoContent(name || '家里的设备')}</div>
      <div class="step-builder">
        <h2>添加操作步骤</h2><p id="device-pin-help" class="device-help">先点照片标记要按的位置，再写一句说明。也可以用方向键移动标记。</p>
        <p id="pin-status" role="status">${deviceEditor.pin ? '已标记按键位置' : ''}</p>
        <label for="device-step-text">这一步怎么做？</label><textarea id="device-step-text" name="step" rows="2" maxlength="100" placeholder="如：按遥控器最上面的电源键"></textarea>
        <button type="button" class="button quiet" data-action="device-add-step">${stepIndex !== null ? '更新这一步' : '添加这一步'}</button>
      </div>
      <ol class="guide-steps" id="guide-steps" aria-label="已有步骤">${editorStepRows()}</ol>
      <p class="form-error" role="alert"></p>
      <button type="submit" class="button wide" ${loading ? 'disabled' : ''}>保存设备卡</button>
      ${id ? `<button type="button" class="button quiet" data-action="share-device" data-id="${id}">分享已保存的设备卡</button><button type="button" class="text-button remove-step" data-action="device-delete">删除设备卡</button>` : ''}
    </form>
  </main>`;
}

function guideError(text) {
  document.querySelector('.guide-editor .form-error').textContent = text;
}

function moveLesson(step) {
  const device = selectedDevice();
  if (!device) return;
  deviceStep = Math.max(0, Math.min(step, device.steps.length));
  render();
  const instruction = document.querySelector('#device-step-heading');
  instruction?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  if (state.listen && device.steps[deviceStep]) speak(device.steps[deviceStep].text);
}

function updatePin(form, pin) {
  deviceEditor.pin = pin;
  const target = form.querySelector('.photo-target');
  target.querySelector('.photo-pin')?.remove();
  if (pin) target.insertAdjacentHTML('beforeend', pinMarkup(pin));
  form.querySelector('#pin-status').textContent = pin ? '已标记按键位置' : '';
}

function addDeviceStep(form) {
  const text = form.elements.step.value.trim();
  if (!deviceEditor.photo || !deviceEditor.pin || !text) {
    guideError('请点照片标记一个按键，再写一句这一步怎么做。');
    return false;
  }
  const index = deviceEditor.stepIndex;
  if (index === null && deviceEditor.steps.length >= 8) {
    guideError('一张卡最多放 8 步。可以把另一件事单独做成一张卡。');
    return false;
  }
  const { x, y } = deviceEditor.pin;
  const entry = { text, x, y };
  if (index === null) deviceEditor.steps.push(entry);
  else deviceEditor.steps[index] = entry;
  deviceEditor.stepIndex = null;
  updatePin(form, null);
  form.elements.step.value = '';
  form.querySelector('[data-action="device-add-step"]').textContent = '添加这一步';
  form.querySelector('#guide-steps').innerHTML = editorStepRows();
  guideError('');
  return true;
}

function saveDeviceGuide(form) {
  if (deviceEditor.loading) return;
  if ((form.elements.step.value.trim() || deviceEditor.pin) && !addDeviceStep(form)) return;
  const name = form.elements.name.value.trim();
  const { id, photo, steps } = deviceEditor;
  if (!name || !photo || !steps.length || steps.some((step) => step.x === null)) {
    guideError('请填写设备名称，选一张照片，并给每个步骤标好按键位置。');
    return;
  }
  if (!id && state.deviceGuides.length >= 8) {
    guideError('这台设备最多保存 8 张设备卡。可以先移除一张不再使用的卡。');
    return;
  }
  const guide = { id: id ?? crypto.randomUUID(), name, photo, steps };
  const previous = state.deviceGuides;
  state.deviceGuides = id ? previous.map((item) => item.id === id ? guide : item) : [...previous, guide];
  if (!save()) {
    state.deviceGuides = previous;
    guideError('浏览器存储不足或不可用，这张设备卡还没有保存。');
    return;
  }
  location.hash = '#/family-devices';
  notify('设备卡已保存。长辈端可以查看了。');
}

function guidesScreen() {
  return `${pageHeader('跟着做', 'elder')}<main class="surface guides-screen">
    <div class="section-heading"><h2>您想学哪一件事？</h2></div>
    <div class="feature-grid">${lifeGuides.map((guide) => {
      const run = readGuideRun(guide, state.guideRuns[guide.id]);
      const inProgress = guide.steps[run.screen]?.title ?? (run.screen === 'help' ? '找人帮忙' : '');
      return featureCard({ link: `guide/${guide.id}`, title: guide.title, subtitle: inProgress ? `继续：${inProgress}` : guide.summary, glyph: guide.icon, color: guide.id === 'parcel' ? 'peach' : 'lilac' });
    }).join('')}
      ${featureCard(quickCards[3])}
      ${featureCard({ link: 'capture', title: '拍照问一问', subtitle: '拍下按键或屏幕', glyph: 'camera', color: 'blue' })}
    </div>
    <p class="device-help">这里是操作演示。实际画面以现场设备或官方服务为准。</p>
  </main>`;
}

function currentGuide() {
  return lifeGuides.find((guide) => guide.id === routeDeviceId());
}

function guidePicture(preview) {
  return `<figure class="guide-picture"><figcaption>${escapeHtml(preview.label)}</figcaption>
    <div class="guide-preview-grid">${preview.labels.map((label, index) => `<span class="guide-preview-label ${index === preview.focus ? 'is-guide-focus' : ''}">${escapeHtml(label)}</span>`).join('')}</div>
    </figure>`;
}

function guideScreen() {
  const guide = currentGuide();
  if (!guide) return `${pageHeader('找不到这份指引', 'guides')}<main class="surface"><p class="empty-card">请返回列表，选择您要做的事。</p></main>`;
  const run = readGuideRun(guide, state.guideRuns[guide.id]);
  const header = pageHeader(guide.title, 'guides');
  const footer = `<nav class="guide-footer" aria-label="指引操作">${run.history.length ? '<button class="button quiet" type="button" data-action="guide-previous">上一步</button>' : ''}<button class="button quiet" type="button" data-action="guide-start-over">重新选画面</button></nav>`;

  if (run.screen === 'pick') {
    return `${header}<main class="surface guide-screen"><h2 id="guide-heading" tabindex="-1">您现在看到什么？</h2>
      <p class="device-help">选一个与您眼前最接近的画面。</p>
      <div class="stack">${guide.starts.map((key) => {
        const step = guide.steps[key];
        return `<button class="guide-choice" type="button" data-action="guide-start" data-step="${key}"><span><strong>${escapeHtml(step.title)}</strong><span>${escapeHtml(step.preview.labels.join(' · '))}</span></span>${icon('right', 21)}</button>`;
      }).join('')}<button class="button quiet wide" type="button" data-action="guide-help">都不一样，找人帮忙</button></div>
      <a class="button quiet guide-capture" href="#/capture/${guide.id}">${icon('camera', 22)}拍照问一问</a>
      <p class="device-help guide-caption">示例里没有真实取件码、户号或交易。</p>
    </main>`;
  }

  if (run.screen === 'help' || run.screen === 'done') {
    const complete = run.screen === 'done';
    return `${header}<main class="surface guide-screen">
      <h2 id="guide-heading" tabindex="-1">${complete ? guide.success : '可以找人帮您看看'}</h2>
      ${complete
        ? '<a class="button wide" href="#/guides">返回「跟着做」</a>'
        : `${run.failed >= 2 ? '<p class="guide-notice">柜门试了两次仍未打开，可以请工作人员查看。</p>' : ''}
          <ol class="guide-help-list">${guide.help.map((text) => `<li>${escapeHtml(text)}</li>`).join('')}</ol>
          <button class="button quiet" type="button" data-action="read" data-text="${escapeHtml(guide.help.join(''))}">${icon('sound', 23)}听求助办法</button>`}
      ${footer}
    </main>`;
  }

  const step = guide.steps[run.screen];
  return `${header}<main class="surface guide-screen">
    <p class="guide-current">当前位置 · ${escapeHtml(step.title)}</p>
    <h2 class="guide-instruction" id="guide-heading" tabindex="-1">${escapeHtml(step.text)}</h2>
    <button class="button quiet listen-step" type="button" data-action="read" data-text="${escapeHtml(step.text)}">${icon('sound', 23)}听这一步</button>
    ${guidePicture(step.preview)}
    <h3>操作后看到什么？</h3>
    <div class="stack guide-options">${step.options.map((option, index) => `<button class="button ${index ? 'quiet' : ''}" type="button" data-action="guide-answer" data-index="${index}">${escapeHtml(option.label)}${icon('right', 19)}</button>`).join('')}</div>
    ${footer}
  </main>`;
}

function guideInteraction(action, button) {
  const guide = currentGuide();
  if (!guide) return;
  let run = readGuideRun(guide, state.guideRuns[guide.id]);
  switch (action) {
    case 'guide-start':
      if (run.screen === 'pick' && guide.starts.includes(button.dataset.step)) run = setGuideScreen(guide, run, button.dataset.step);
      break;
    case 'guide-answer': {
      const option = guide.steps[run.screen]?.options[Number(button.dataset.index)];
      if (option) run = setGuideScreen(guide, run, option.to, option.countFailure);
      break;
    }
    case 'guide-help': run = setGuideScreen(guide, run, 'help'); break;
    case 'guide-previous': run = previousGuideScreen(run); break;
    case 'guide-start-over': run = readGuideRun(guide, null); break;
  }
  state.guideRuns[guide.id] = run;
  save();
  render();
  window.scrollTo(0, 0);
  document.querySelector('#guide-heading')?.focus({ preventScroll: true });
}

function connectionsScreen() {
  if (account.guest) return `${pageHeader('家庭连接', 'family')}<main class="surface connections">
    <p class="empty-card">${cloudSite ? '请在云端版登录后连接家人，分享问题和设备卡。' : '登录后可以连接家人，分享问题和设备卡。'}</p>
    ${loginAction('用邮箱登录', 'button', 'connections')}
  </main>`;
  const links = family?.links ?? [];
  const items = family?.items ?? [];
  return `${pageHeader('家庭连接', 'family')}<main class="surface connections-screen">
    <p class="device-help">用邀请码连接不同账户。连接后，在「分享设置」选择对方能看到的内容。</p>
    <div class="connection-actions">
      <button class="button" type="button" data-action="invite-family">生成邀请码</button>
      <button class="button quiet" type="button" data-action="join-family">输入家人的邀请码</button>
    </div>
    ${invite ? `<div class="connection-code"><label for="invite-code">邀请码 · 24 小时有效</label><input id="invite-code" readonly value="${escapeHtml(invite)}"><button class="button quiet" type="button" data-action="copy-invite">复制邀请码</button></div>` : ''}
    ${familyError ? `<p role="alert" class="form-error">${escapeHtml(familyError)}</p><button class="button quiet" type="button" data-action="reload-family">重新读取</button>` : ''}
    <section><h2>已连接的家人</h2>
      ${links.length ? `<div class="shared-list">${links.map((person) => `<div class="connection-row family-person"><strong>${escapeHtml(person.name)}</strong><div class="section-actions">
        <button type="button" class="text-button" data-action="family-permission" data-id="${escapeHtml(person.id)}" aria-label="${escapeHtml(person.name)}的分享设置">分享设置</button>
        <button type="button" class="text-button" data-action="remove-family" data-id="${escapeHtml(person.id)}">解除连接</button></div></div>`).join('')}</div>` : `<p class="empty-card">${familyBusy ? '正在读取…' : '还没有连接家人。'}</p>`}
    </section>
    <section><h2>家庭分享</h2>
      ${items.length ? `<div class="shared-list">${items.map((item) => `<article class="connection-row connection-share"><div><strong>${escapeHtml(item.payload.title)}</strong><span>${item.direction === 'sent' ? '发给' : '来自'} ${escapeHtml(item.name)} · ${formatWhen(item.at)}</span></div>
        ${item.kind === 'device' ? `<a class="button quiet" href="#/shared-device/${item.id}">看步骤</a>` : ''}
        ${item.direction === 'sent' ? `<button type="button" class="text-button" data-action="recall-share" data-id="${item.id}">撤回</button>` : ''}
      </article>`).join('')}</div>` : '<p class="empty-card">主动分享的问题和设备卡会显示在这里。</p>'}
    </section>
    <div class="connection-account"><button class="text-button" type="button" data-action="reload-family">刷新家庭分享</button><button class="text-button" data-action="account-signout" type="button">退出登录</button></div>
  </main>`;
}

function familyOverviewScreen() {
  const title = pageHeader('长辈聊天和近况', 'family');
  if (account.guest) return `${title}<main class="surface connections-screen"><p class="empty-card">登录并连接长辈后，可以查看对方同意分享的内容。</p>${loginAction('用邮箱登录', 'button', 'family-overview')}</main>`;
  const links = family?.links ?? [];
  const id = routeDeviceId();
  const data = overview?.id === id ? overview : null;
  const seen = data?.activity?.lastSeen;
  const days = seen ? inactiveDays(seen) : 0;
  return `${title}<main class="surface connections-screen family-overview">
    ${links.length ? `<section><h2>选择一位家人</h2><div class="connection-actions">${links.map((person) => `<a class="button ${id === person.id ? '' : 'quiet'}" href="#/family-overview/${encodeURIComponent(person.id)}" ${id === person.id ? 'aria-current="page"' : ''}>${escapeHtml(person.name)}</a>`).join('')}</div></section>` : ''}
    ${!id ? familyError ? `<p class="form-error" role="alert">${escapeHtml(familyError)}</p><button class="button quiet" data-action="reload-family" type="button">重新读取</button>`
      : !links.length ? familyBusy ? '<p class="empty-card" role="status">正在读取家人…</p>' : '<p class="empty-card">先通过邀请码连接长辈。</p><a class="button" href="#/connections">去连接家人</a>' : '<p class="empty-card">选择家人后可查看对方分享的内容。</p>'
      : data?.error ? `<p class="form-error" role="alert">${escapeHtml(data.error)}</p><button class="button quiet" type="button" data-action="reload-overview">重新读取</button>`
      : !data || data.loading ? '<p class="empty-card" role="status">正在读取长辈分享的内容…</p>'
      : `<div class="section-heading"><h2>${escapeHtml(data.name)}分享的内容</h2><button class="text-button" type="button" data-action="reload-overview">刷新</button></div>
        <section class="overview-card"><h3>最近使用</h3>
          <p>${data.activity ? seen ? `上次使用禾伴 ${formatWhen(seen)}` : '暂时还没有使用记录。' : '这位家人还未分享使用时间。'}</p>
          ${seen && days >= data.activity.quietDays ? `<p>已 ${days} 天未打开禾伴。方便时可以打电话问候。</p>` : ''}</section>
        <section class="overview-card"><h3>最近聊天和问答</h3>${data.chats ? [['ask', '生活问答'], ['chat', '聊聊天']].map(([mode, label]) => `<div class="overview-conversation"><h4>${label}</h4>
          ${data.chats[mode].length ? `<ul class="record-list">${data.chats[mode].map((message) => `<li><strong>${message.role === 'user' ? '长辈' : '禾伴'}</strong>${message.at ? `<time datetime="${new Date(message.at).toISOString()}">${formatWhen(message.at)}</time>` : ''}<p>${escapeHtml(message.text)}</p></li>`).join('')}</ul>` : '<p>暂无聊天记录。</p>'}</div>`).join('')
          : '<p>这位家人还未分享聊天内容。长辈可在「我的 → 和家人分享」里开启。</p>'}</section>`}
  </main>`;
}

async function loadOverview() {
  const id = routeDeviceId();
  if (!id || account?.guest || route !== 'family-overview') return;
  const active = account;
  const current = { id, loading: true };
  overview = current;
  render();
  try { Object.assign(current, await api(`/api/family/overview/${encodeURIComponent(id)}`)); }
  catch (error) { current.error = error.message; }
  finally {
    current.loading = false;
    if (active === account && overview === current && route === 'family-overview' && routeDeviceId() === id) render();
  }
}

function showFamilyPermission(id) {
  const person = family?.links.find((item) => item.id === id);
  if (!person) return;
  const permission = familyPermission(state, person);
  showDialog(`分享给${escapeHtml(person.name)}`, `<form data-form="family-permission" data-id="${escapeHtml(id)}">
    <label class="check-input"><input type="checkbox" name="activity" ${permission?.activity ? 'checked' : ''}><span>让对方查看我最近使用禾伴的时间</span></label>
    <label class="check-input"><input type="checkbox" name="chats" ${permission?.chats ? 'checked' : ''}><span>让对方查看我最近的聊天和问答文字</span></label>
    <p class="form-help">请由本人选择。开启后，对方可看到每个聊天页最近 12 条文字，取消勾选并保存即可关闭。</p>
    <p class="form-error" role="alert"></p><button class="button wide" type="submit">保存分享设置</button>
  </form>`);
}

async function saveFamilyPermission(form, data) {
  const person = family?.links.find((item) => item.id === form.dataset.id);
  if (!person) return;
  const active = account;
  const button = form.querySelector('[type=submit]');
  const activity = data.has('activity');
  const chats = data.has('chats');
  state.familyVisibility = state.familyVisibility.filter((item) => item.id !== person.id);
  if (activity || chats) state.familyVisibility.push({ id: person.id, linkedAt: person.linkedAt, activity, chats });
  if (activity && document.visibilityState === 'visible') state.lastSeen = Date.now();
  const notified = save();
  button.disabled = true;
  try {
    if (!notified || !await flushCloud()) throw new Error('设置还没同步，请连接网络后重试。');
    if (account !== active) return;
    if (form.isConnected) dialog.close();
    render();
    notify('分享设置已保存。');
  } catch (error) { form.querySelector('.form-error').textContent = error.message; }
  finally { button.disabled = false; }
}

let familyLoad;
async function loadFamily() {
  if (account?.guest) return;
  const active = account;
  if (familyLoad) return familyLoad;
  const previous = family;
  familyBusy = true;
  familyError = '';
  familyLoad = api('/api/family').then((data) => { if (account === active && family === previous) family = data; },
    (error) => { if (account === active) familyError = error.message; })
    .finally(() => { if (account === active) { familyLoad = null; familyBusy = false; } });
  await familyLoad;
  if (account === active && familyPages.includes(route)) render();
}

function actionError(error) {
  const errorField = dialog.open && dialog.querySelector('.form-error');
  if (errorField) errorField.textContent = error.message;
  else notify(error.message);
}

function joinFamilyDialog() {
  showDialog('输入家人的邀请码', `<form data-form="join-family">
    <label for="join-code">家人发给您的邀请码</label><input id="join-code" name="code" required maxlength="35" autocomplete="off" spellcheck="false">
    <p class="form-help">连接后，您仍然可以选择每次分享什么。</p><p class="form-error" role="alert"></p>
    <button class="button wide" type="submit">确认连接</button></form>`);
}

async function openShareItem(kind, id) {
  if (account.guest) {
    showDialog('登录后分享', `<p class="form-help">${cloudSite ? '可以在云端版与家人连接并分享问题或设备卡。' : '登录后可以把这条内容分享给已连接的家人。'}</p>${loginAction('用邮箱登录', 'button wide')}`);
    return;
  }
  const item = kind === 'device' ? state.deviceGuides.find((entry) => entry.id === id)
    : state.messages.ask.find((entry) => entry.role === 'user' && entry.id === id);
  if (!item) return;
  const startRoute = location.hash;
  await loadFamily();
  if (startRoute !== location.hash) return;
  if (familyError) { notify(familyError); return; }
  if (!family?.links.length) {
    showDialog('先连接一位家人', '<p class="form-help">建立连接后，就可以把这一条内容分享给对方。</p><a class="button wide" href="#/connections">去家庭连接</a>');
    return;
  }
  showDialog('分享给家人', `<p class="share-preview">${escapeHtml(kind === 'device' ? item.name : item.text)}</p>
    <form data-form="share-family" data-kind="${kind}" data-id="${id}">
    <label for="share-recipient">分享给谁？</label><select id="share-recipient" name="recipient" required>
      <option value="">选择一位家人</option>${family.links.map((person) => `<option value="${person.id}">${escapeHtml(person.name)}</option>`).join('')}
    </select><p class="form-help">对方可以看到这一次分享。您可以在家庭连接里撤回。</p><p class="form-error" role="alert"></p>
    <button class="button wide" type="submit">确认分享</button></form>`);
}

async function familyForm(form, data) {
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const joining = form.dataset.form === 'join-family';
    if (!joining && !await flushCloud()) throw new Error('这条内容还没有同步，请先完成云端保存。');
    family = joining ? await api('/api/family/join', 'POST', { code: data.get('code') })
      : await api('/api/family/share', 'POST', { recipient: data.get('recipient'), kind: form.dataset.kind, itemId: form.dataset.id });
    dialog.close();
    if (route === 'connections') render();
    notify(joining ? '已经连接家人。' : '已分享给所选家人。');
  } catch (error) { actionError(error); }
  finally { button.disabled = false; }
}

async function connectionAction(action, id, button) {
  if (action === 'reload-family') { await loadFamily(); return; }
  if (action === 'join-family') { joinFamilyDialog(); return; }
  if (action === 'remove-family' || action === 'recall-share') {
    const removing = action === 'remove-family';
    showDialog(removing ? '解除家庭连接？' : '撤回这条分享？', `<p class="form-help">${removing ? '解除连接后，双方将无法再查看这段连接里的分享。' : '撤回后，对方将无法再查看这条内容。'}</p>
      <div class="dialog-actions"><button type="button" class="button quiet" data-action="close">取消</button><button type="button" class="button danger" data-action="${removing ? 'confirm-remove-family' : 'confirm-recall-share'}" data-id="${id}">确认</button></div>`);
    return;
  }
  button.disabled = true;
  try {
    if (action === 'invite-family') {
      invite = (await api('/api/family/invite', 'POST')).code;
      if (route === 'connections') render();
    } else if (action === 'copy-invite') {
      try { await navigator.clipboard.writeText(invite); notify('邀请码已复制。'); }
      catch { document.querySelector('#invite-code')?.select(); notify('请选择并复制邀请码。'); }
    } else {
      const kind = action === 'confirm-remove-family' ? 'link' : 'share';
      family = await api(`/api/family/${kind}/${id}`, 'DELETE');
      dialog.close();
      if (route === 'connections') render();
      notify('操作完成。');
    }
  } catch (error) { actionError(error); }
  finally { button.disabled = false; }
}

function cloudEntry(message = '', values = {}) {
  accountBar.hidden = true;
  const creating = formMode === 'create';
  app.innerHTML = `<header class="topbar"><span class="brand">${icon('home', 40)}禾伴</span></header>
    <main class="surface cloud-entry entry-choice"><h1 id="screen-title" tabindex="-1">${formMode ? creating ? '创建禾伴账户' : '用邮箱登录' : '您的生活帮手'}</h1>
    ${formMode ? `<p>用手机或电脑的指纹、面容或锁屏密码确认身份。</p>
      <form class="sign-in-form" data-form="email-login">
        ${creating ? `<label for="login-name">怎么称呼您？</label><input id="login-name" name="name" autocomplete="nickname" maxlength="40" value="${escapeHtml(values.name ?? '')}" required>` : ''}
        <label for="login-email">邮箱</label><input id="login-email" name="email" type="email" inputmode="email" autocomplete="username" maxlength="254" value="${escapeHtml(values.email ?? '')}" required>
        <p class="form-error" role="alert">${escapeHtml(message)}</p>
        <button class="button" type="submit">${creating ? '确认设备并创建' : '确认设备并登录'}</button>
      </form>
      <button class="text-button" data-action="${creating ? 'login-existing' : 'login-create'}" type="button">${creating ? '已有禾伴账户？登录' : '第一次使用？创建账户'}</button>`
      : `<p>学取快递、查电费。遇到不会按的键，拍张照片问一问。</p>
      ${message ? `<p class="form-error" role="alert">${escapeHtml(message)}</p>` : ''}
      <button class="button" type="button" data-action="continue-guest">不登录，直接用</button>
      <button class="button quiet" type="button" data-action="login-create">用邮箱继续</button>
      <p class="form-help">跳过后，提醒和照片保存在当前浏览器。</p>`}
    ${formMode ? '<button class="text-button" data-action="continue-guest" type="button">不登录，直接用</button>' : ''}
    ${account ? '<button class="text-button" type="button" data-action="close-login">返回</button>' : ''}
    <details class="old-account"><summary>找回旧版记录</summary><a href="${legacySignIn}" target="_top">打开旧版账户</a></details>
    </main>`;
}

async function startCloud(mode) {
  const switching = Boolean(authMode && mode !== authMode);
  const result = await connectCloud(updateCloudStatus, mode);
  electricity.reset();
  phoneGuide.reset();
  account = result.user;
  authMode = mode;
  account = mode === 'legacy' ? { ...account, legacy: true } : account;
  state = { ...newState(), ...result.state };
  family = null;
  familyLoad = null;
  familyError = '';
  familyBusy = false;
  overview = null;
  invite = null;
  formMode = '';
  authPanel = false;
  accessPreference(mode);
  if (location.hash === '#/legacy') {
    history.replaceState(null, '', '#/connections');
    route = readRoute();
  } else if (switching) {
    const destination = { record: 'records', 'shared-device': 'connections', 'device-editor': 'family-devices' }[route];
    if (destination) {
      history.replaceState(null, '', `#/${destination}`);
      route = readRoute();
    }
  }
  updateCloudStatus('saved');
  enterScreen(true);
}

async function boot() {
  let locked = false;
  try {
    if (cloudSite) {
      await startCloud('guest');
      return;
    }
    const choice = accessPreference();
    const old = location.hash === '#/legacy' || choice === 'legacy';
    const mode = old ? 'legacy' : choice === 'guest' ? 'guest' : (await api('/api/auth/session')).signedIn ? 'account' : '';
    if (authBusy || (!old && (authPanel || account))) return;
    authBusy = locked = true;
    if (mode) await startCloud(mode);
  } catch (error) {
    if (locked || !authPanel && !account) cloudEntry(error.status === 401 ? '' : error.message);
  } finally {
    if (locked) authBusy = false;
  }
}

async function flushBeforeSwitch() {
  if (unsyncedCloud() && !await flushCloud() && cloudStatus !== 'auth') throw new Error('还有内容没有保存，请先重试保存。');
}

async function chooseAccess(action, button) {
  if (authBusy) return;
  if (action === 'show-login' || action === 'login-create' || action === 'login-existing') {
    const values = { name: document.querySelector('#login-name')?.value, email: document.querySelector('#login-email')?.value };
    if (dialog.open) dialog.close();
    authPanel = true;
    records.stopCamera();
    formMode = action === 'login-existing' ? 'login' : 'create';
    cloudEntry('', values);
    document.querySelector('#screen-title')?.focus();
    return;
  }
  if (action === 'close-login') {
    authPanel = false;
    updateCloudStatus(cloudStatus);
    enterScreen(true);
    return;
  }
  authBusy = true;
  button.disabled = true;
  try {
    if (action === 'continue-guest') {
      await flushBeforeSwitch();
      await startCloud('guest');
    } else if (action === 'account-signout') {
      await flushBeforeSwitch();
      if (authMode === 'account') await api('/api/auth/logout', 'POST');
      electricity.reset();
      phoneGuide.reset();
      accessPreference('');
      account = null;
      authMode = '';
      authPanel = true;
      records.close();
      formMode = '';
      cloudEntry();
    }
  } catch (error) {
    notify(error.message);
  } finally {
    authBusy = false;
    button.disabled = false;
  }
}

async function submitEmailLogin(form, data) {
  if (authBusy) return;
  authBusy = true;
  const button = form.querySelector('button[type="submit"]');
  const errorField = form.querySelector('.form-error');
  button.disabled = true;
  errorField.textContent = '';
  try {
    await flushBeforeSwitch();
    await signInWithDevice(api, formMode, { email: data.get('email'), name: data.get('name') });
    await startCloud('account');
  } catch (error) {
    errorField.textContent = error.message;
  } finally {
    authBusy = false;
    button.disabled = false;
  }
}

function render() {
  if (authPanel) return;
  const screens = {
    elder: elderHome, family: familyHome, chat: () => chatScreen('chat'), ask: () => chatScreen('ask'),
    'family-chat': () => chatScreen('family-chat'), reminders: () => remindersScreen('elder'),
    'family-reminders': () => remindersScreen('family'), devices: devicesScreen, device: deviceScreen,
    'family-devices': familyDevicesScreen, 'family-shortcuts': familyShortcutsScreen, 'device-editor': deviceEditorScreen, guides: guidesScreen, guide: guideScreen,
    connections: connectionsScreen, 'shared-device': deviceScreen, 'home-shortcuts': homeShortcutsScreen, 'family-overview': familyOverviewScreen,
    capture: records.captureScreen, records: records.recordsScreen, record: records.recordScreen, 'assistant-settings': assistantSettings, mine: mineScreen,
  };
  const screen = electricityRoutes.includes(route) ? electricity.screen : screens[route];
  app.innerHTML = screen() + bottomNav();
}

function showDialog(title, body) {
  if (!dialog.open) returnFocus = document.activeElement;
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  dialog.innerHTML = `<div class="dialog-body"><div class="dialog-heading"><h2 id="dialog-title">${title}</h2><button class="icon-button" type="button" data-action="close" aria-label="关闭">${icon('close')}</button></div>${body}</div>`;
  if (!dialog.open) dialog.showModal();
}

function draftReminder(owner, item = null, suggested = null, draftId = '') {
  const defaultTime = new Date(Date.now() + 60 * 60_000);
  const value = item ?? suggested;
  const stamp = value?.at && (item || value.at > Date.now()) ? value.at : defaultTime.getTime();
  showDialog(item ? '管理提醒' : '新建提醒', `<form data-form="reminder" data-owner="${owner}" data-id="${item?.id ?? draftId}" data-editing="${Boolean(item)}">
    ${item ? '' : `<label for="reminder-sentence">也可以说一句话</label><div class="sentence-row"><button class="icon-button mic" type="button" data-action="voice" data-target="reminder-sentence" aria-label="用语音说提醒">${icon('mic')}</button><input id="reminder-sentence" name="sentence" placeholder="如：明早八点提醒我买菜" maxlength="150"><button class="button quiet" type="button" data-action="parse">填进去</button></div>`}
    <label for="reminder-title">要提醒什么？</label><input id="reminder-title" name="title" value="${escapeHtml(value?.title ?? '')}" maxlength="80" placeholder="比如：下楼散步" required ${item ? '' : 'autofocus'}>
    <div class="form-columns"><div><label for="reminder-date">日期</label><input id="reminder-date" name="date" type="date" value="${localDate(stamp)}" required></div><div><label for="reminder-time">时间</label><input id="reminder-time" name="time" type="time" value="${localTime(stamp)}" required></div></div>
    <label for="reminder-repeat">重复</label><select id="reminder-repeat" name="repeat">${Object.entries(repeats).map(([key, label]) => `<option value="${key}" ${key === value?.repeat ? 'selected' : ''}>${label}</option>`).join('')}</select>
    <p class="form-help">这里会在页面打开时提醒，也可以保存到手机日历。</p>
    <p class="form-error" role="alert"></p><button class="button wide" type="submit">保存提醒</button>
    ${item ? `<div class="dialog-actions"><button class="button quiet" type="button" data-action="complete" data-id="${item.id}">${item.repeat && item.repeat !== 'never' ? '完成本次' : item.done ? '恢复待办' : '标为完成'}</button><button class="button quiet" type="button" data-action="calendar" data-id="${item.id}">保存到日历</button><button class="button danger" type="button" data-action="remove-reminder" data-id="${item.id}">删除提醒</button></div>` : ''}</form>`);
}

function showCare() {
  showDialog('关怀设置', `<form data-form="care">
    <label class="check-input"><input type="checkbox" name="monitoring" ${state.monitoring ? 'checked' : ''}><span>长辈本人同意显示最近使用时间及未使用提醒</span></label>
    <label for="quiet-days">几天没打开长辈端后提醒</label><select id="quiet-days" name="days">${[1, 2, 3, 5, 7].map((number) => `<option value="${number}" ${state.quietDays === number ? 'selected' : ''}>${number} 天</option>`).join('')}</select>
    <p class="form-help">这条提示会出现在本机家属端。看到提醒时，可以先打个电话问候。</p><button class="button wide" type="submit">保存设置</button>
    <button class="button quiet wide" type="button" data-action="demo-care">${demoLastSeen ? '结束提醒演示' : '预览未使用提醒'}</button></form>`);
}

function assistantSettings() {
  const origin = routeDeviceId();
  const back = ['ask', 'chat', 'elder', 'mine'].includes(origin) ? origin : 'ask';
  return `${pageHeader('选择助手', back)}<main class="surface assistant-settings">
    <form data-form="persona">
      <fieldset><legend>回复风格</legend><div class="persona-options">${Object.entries(personas).map(([name, info], i) => `
        <label class="option-card"><input type="radio" name="persona" value="${name}" ${state.persona === name ? 'checked' : ''} required>
          <span class="feature-icon tone-${['blue', 'mint', 'lilac'][i]}">${icon('chat', 23)}</span><strong>${name}</strong><span>${info.label}</span>
        </label>`).join('')}</div></fieldset>
      <section class="feature-banner voice-banner">
        <div class="banner-copy"><p class="persona-preview" aria-live="polite">${personas[state.persona].preview}</p>
          <button class="button quiet" type="button" data-action="preview-persona">${icon('sound', 21)}试听</button></div>
        <img src="./assets/voice-card.webp" alt="" width="480" height="480">
      </section>
      <fieldset><legend>朗读语速</legend><div class="rate-options">${Object.entries(speechRates).map(([rate, item]) => `
        <label class="option-card"><input type="radio" name="speech-rate" value="${rate}" ${rate === state.speechRate ? 'checked' : ''} required><span>${item.label}</span></label>`).join('')}
      </div></fieldset>
      <div class="interest-field"><label for="interests">喜欢聊的话题（选填）</label><input id="interests" name="interests" placeholder="比如：种花、做饭、听戏" value="${escapeHtml(state.interests)}" maxlength="80"></div>
      <button class="button wide" type="submit">保存助手设置</button>
    </form>
  </main>`;
}

function showContact() {
  showDialog('设置家人电话', `<form data-form="contact"><label for="contact-name">怎么称呼？</label><input id="contact-name" name="name" maxlength="18" value="${escapeHtml(state.contactName)}" required><label for="contact-phone">电话号码</label><input id="contact-phone" name="phone" type="tel" inputmode="tel" maxlength="24" value="${escapeHtml(state.phone)}" placeholder="输入要联系的电话号码" required><p class="form-error" role="alert"></p><button class="button wide" type="submit">保存号码</button></form>`);
}

function setSentence(text, form) {
  const draft = parseReminder(text);
  const error = form.querySelector('.form-error');
  if (!draft || draft.at <= Date.now()) {
    error.textContent = '请说清楚未来的时间，比如「明早八点提醒我买菜」。也可以直接选日期和时间。';
    return;
  }
  error.textContent = '';
  if (draft.title) form.elements.title.value = draft.title.slice(0, 80);
  form.elements.date.value = localDate(draft.at);
  form.elements.time.value = localTime(draft.at);
  form.elements.repeat.value = draft.repeat;
  form.elements.title.focus();
}

async function sendMessage(text, retry = false) {
  const input = text.trim().slice(0, 300);
  if (!input) return;
  const mode = route;
  const active = account;
  const messages = state.messages[mode];
  if (!messages || pendingReplies.get(mode) === active) return;
  if (retry) {
    const failed = failedReplies.get(mode);
    if (failed?.account !== active || messages.at(-1)?.id !== failed.questionId) return;
  } else {
    messages.push({ id: crypto.randomUUID(), role: 'user', text: input, at: Date.now() });
  }
  failedReplies.delete(mode);
  const questionId = messages.at(-1).id;
  const history = messages.slice(0, -1).filter(({ role, text }) => role !== 'assistant'
    || !text.startsWith('可以先参考禾伴的内置指引。\n')).slice(-6).map(({ role, text }) => ({ role, text }));
  const draft = /提醒|叫我|记得/.test(input) ? parseReminder(input) : null;
  const validDraft = draft?.title && draft.at > Date.now() ? draft : null;
  let reply;
  const localTopic = mode === 'ask' ? phoneTopic(input) : '';
  let offerPhoneGuide = Boolean(localTopic);
  let failure;
  if (validDraft) reply = `提醒已经填好：${formatWhen(validDraft.at)}，${validDraft.title}。请核对一下，再保存。`;
  else if (/^(您好|你好|哈喽|嗨|hello|hi)[！!。？?，,.\s]*$/i.test(input)) {
    reply = '您好！您想办什么事？可以说出来，也可以在下方打字。';
  } else if (localTopic) {
    reply = localTopic === 'font' ? '我带您把手机的字调大。点下面的「听着一步一步做」，就可以开始。'
      : '我带您连上无线网。点下面的「听着一步一步做」，就可以开始。';
  } else {
    pendingReplies.set(mode, active);
    save();
    render();
    document.querySelector('.assistant-wait')?.scrollIntoView({ block: 'nearest' });
    try {
      const result = await askAssistant({ text: input, history, style: state.persona, ...(mode === 'ask' ? { suggestPhoneGuide: true } : {}) });
      reply = result.answer;
      offerPhoneGuide = mode === 'ask' && result.offerPhoneGuide === true;
      if (!reply) throw new Error('没有收到回复。');
    }
    catch (error) {
      failure = error;
    }
    finally { if (pendingReplies.get(mode) === active) pendingReplies.delete(mode); }
  }
  if (account !== active) return;
  if (failure) failedReplies.set(mode, { account: active, text: input, error: failure, questionId });
  else messages.push({ id: crypto.randomUUID(), role: 'assistant', text: reply, draft: validDraft, at: Date.now(),
    ...(offerPhoneGuide ? { guideFor: questionId } : {}) });
  if (messages.length > 150) messages.splice(0, messages.length - 150);
  noteActivity();
  save();
  if (route !== mode || authPanel) return;
  render();
  if (failure) {
    document.querySelector('.assistant-retry')?.scrollIntoView({ block: 'nearest' });
    document.querySelector('[data-action=assistant-retry]')?.focus({ preventScroll: true });
  } else {
    document.querySelector('.message:last-child')?.scrollIntoView({ block: 'nearest' });
    document.querySelector('#message-input')?.focus({ preventScroll: true });
  }
  if (state.listen) speak(failure?.message || reply, state.speechRate, false);
}

function startVoice(button) {
  if (!voices) {
    notify('这台浏览器暂不支持语音输入，您可以打字。');
    return;
  }
  if (recognition) {
    recognition.stop();
    return;
  }
  const target = document.getElementById(button.dataset.target || 'message-input');
  if (!target) return;
  const speech = new voices();
  speech.lang = 'zh-CN';
  speech.onresult = (event) => {
    target.value = event.results[0][0].transcript.slice(0, target.maxLength);
    target.focus();
  };
  speech.onerror = () => notify('没有听清，您可以重试或打字。');
  speech.onend = () => {
    button.classList.remove('recording');
    button.setAttribute('aria-pressed', 'false');
    recognition = undefined;
  };
  try {
    speech.start();
    recognition = speech;
    button.classList.add('recording');
    button.setAttribute('aria-pressed', 'true');
    notify('正在听，请说话。');
  } catch {
    notify('暂时无法开启麦克风，您可以打字。');
  }
}

function downloadReminder(item) {
  const url = URL.createObjectURL(new Blob([calendarFile(item)], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = '禾伴提醒.ics';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  notify('已下载日历文件，请用日历打开并确认添加。');
}

function refresh(message) {
  const wasDialog = dialog.open;
  if (wasDialog) dialog.close();
  save();
  render();
  if (wasDialog) document.querySelector('#screen-title')?.focus({ preventScroll: true });
  if (message) notify(message);
}

function checkReminders() {
  if (authPanel || document.visibilityState !== 'visible' || route === 'capture') return;
  const owner = elderRoutes.includes(route) ? 'elder' : 'family';
  const due = state.reminders.find((item) => item.owner === owner && !item.done && !item.notified && item.at <= Date.now());
  if (!due || dialog.open) return;
  due.notified = true;
  save();
  showDialog('提醒时间到了', `<p class="share-preview">${escapeHtml(due.title)}</p><div class="dialog-actions"><button class="button" type="button" data-action="complete" data-id="${due.id}">已完成</button><button class="button quiet" type="button" data-action="close">我知道了</button></div>`);
  if (state.listen) speak(`提醒时间到了：${due.title}`, state.speechRate, false);
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id, text } = button.dataset;
  if (['show-login', 'login-create', 'login-existing', 'continue-guest', 'close-login', 'account-signout'].includes(action)) {
    void chooseAccess(action, button);
    return;
  }
  if (!account) return;
  if (action === 'open-phone-guide' && route === 'ask') {
    const messages = state.messages.ask;
    const index = messages.findIndex((item) => item.role === 'user' && item.id === id);
    if (index !== -1) {
      stopSpeech();
      phoneGuide.open(messages[index], messages.slice(Math.max(0, index - 4), index).map(({ role, text }) => ({ role, text })));
    }
    return;
  }
  if (action.startsWith('phone-')) { phoneGuide.action(action.slice('phone-'.length)); return; }
  if (action.startsWith('electricity-')) { void electricity.action(action.slice('electricity-'.length), button, event); return; }
  if (action === 'hide-electricity' || action === 'restore-electricity') {
    void electricity.visibility(id, action === 'hide-electricity', button).catch(actionError);
    return;
  }
  if (recordRoutes.includes(route) && action.startsWith('capture-')) { void records.action(action, button); return; }
  if (action === 'remove-shortcut') { void removeShortcut(button); return; }
  if (action === 'restore-shortcut') { state.hiddenShortcuts = state.hiddenShortcuts.filter((key) => key !== button.dataset.key); refresh('已恢复到首页。'); return; }
  if (action === 'family-permission') { showFamilyPermission(id); return; }
  if (action === 'reload-overview') { void loadOverview(); return; }
  if (action === 'cloud-retry') { void flushCloud(); return; }
  if (action === 'cloud-refresh') {
    showDialog('读取云端版本？', '<p class="form-help">本页尚未同步的修改将被放弃，账户会回到云端保存的版本。</p><button class="button wide" data-action="cloud-refresh-confirm" type="button">读取云端版本</button>');
    return;
  }
  if (action === 'cloud-refresh-confirm') { dialog.close(); void startCloud(authMode).catch((error) => notify(error.message)); return; }
  if (['invite-family','join-family','copy-invite','reload-family','remove-family','recall-share','confirm-remove-family','confirm-recall-share'].includes(action)) {
    void connectionAction(action, id, button);
    return;
  }
  if (route === 'guide' && action.startsWith('guide-')) {
    guideInteraction(action, button);
    return;
  }
  const item = state.reminders.find((reminder) => reminder.id === id);
  const owner = elderRoutes.includes(route) ? 'elder' : 'family';
  switch (action) {
    case 'close': dialog.close(); break;
    case 'preview-persona': {
      const form = button.form;
      speak(personas[form.elements.persona.value].preview, form.elements['speech-rate'].value);
      break;
    }
    case 'care': showCare(); break;
    case 'contact': showContact(); break;
    case 'demo-care': {
      demoLastSeen = demoLastSeen ? null : Date.now() - state.quietDays * 86_400_000;
      dialog.close();
      render();
      break;
    }
    case 'listen': {
      state.listen = !state.listen;
      button.setAttribute('aria-pressed', String(state.listen));
      save();
      if (state.listen) speak('已开启听回复。');
      else stopSpeech();
      break;
    }
    case 'read': speak(text); break;
    case 'device-key': {
      const device = selectedDevice();
      const step = device?.steps[deviceStep];
      if (!step) break;
      if (button.dataset.key === step.key) moveLesson(deviceStep + 1);
      else document.querySelector('#device-feedback').textContent = `再找找「${device.controls.find(([key]) => key === step.key)[1]}」。`;
      break;
    }
    case 'device-previous': moveLesson(deviceStep - 1); break;
    case 'device-next': moveLesson(deviceStep + 1); break;
    case 'device-restart': moveLesson(0); break;
    case 'device-pin': {
      const bounds = button.querySelector('img').getBoundingClientRect();
      const clampCoordinate = (value) => Math.max(0, Math.min(1, value));
      const pin = event.detail && bounds.width && bounds.height
        ? { x: clampCoordinate((event.clientX - bounds.left) / bounds.width), y: clampCoordinate((event.clientY - bounds.top) / bounds.height) }
        : deviceEditor.pin ?? { x: 0.5, y: 0.5 };
      updatePin(button.form, pin);
      guideError('');
      break;
    }
    case 'device-add-step': {
      if (addDeviceStep(button.form)) button.form.querySelector('.photo-target').focus();
      break;
    }
    case 'device-edit-step': {
      const index = Number(button.dataset.index);
      const step = deviceEditor.steps[index];
      deviceEditor.stepIndex = index;
      button.form.elements.step.value = step.text;
      updatePin(button.form, step.x === null ? null : step);
      button.form.querySelector('[data-action="device-add-step"]').textContent = '更新这一步';
      guideError('');
      button.form.querySelector('.photo-target').focus();
      break;
    }
    case 'device-remove-step': {
      const index = Number(button.dataset.index);
      deviceEditor.steps.splice(index, 1);
      if (deviceEditor.stepIndex === index) {
        deviceEditor.stepIndex = null;
        button.form.elements.step.value = '';
        updatePin(button.form, null);
        button.form.querySelector('[data-action="device-add-step"]').textContent = '添加这一步';
      } else if (deviceEditor.stepIndex !== null && deviceEditor.stepIndex > index) deviceEditor.stepIndex -= 1;
      button.form.querySelector('#guide-steps').innerHTML = editorStepRows();
      guideError('');
      button.form.querySelector('[data-action="device-add-step"]').focus();
      break;
    }
    case 'device-delete': {
      showDialog('删除这张设备卡？', `<p class="share-preview">${escapeHtml(deviceEditor.name)}</p><div class="dialog-actions"><button type="button" class="button quiet" data-action="close">取消</button><button type="button" class="button danger" data-action="device-delete-confirmed">删除</button></div>`);
      break;
    }
    case 'device-delete-confirmed': {
      const previous = state.deviceGuides;
      state.deviceGuides = previous.filter((entry) => entry.id !== deviceEditor.id);
      if (!save()) {
        state.deviceGuides = previous;
        dialog.close();
        guideError('浏览器暂时无法保存，设备卡没有删除。');
        break;
      }
      dialog.close();
      location.hash = '#/family-devices';
      notify('设备卡已删除。');
      break;
    }
    case 'voice': startVoice(button); break;
    case 'example': sendMessage(text); break;
    case 'assistant-retry': {
      const failed = failedReplies.get(route);
      if (failed) void sendMessage(failed.text, true);
      break;
    }
    case 'new-reminder': draftReminder(owner, null, owner === 'family' ? { title: `给${state.contactName}打电话` } : null); break;
    case 'reminder-example': draftReminder(owner, null, parseReminder(text)); break;
    case 'draft': {
      const message = state.messages[route]?.find((entry) => entry.id === id);
      if (message?.draft) draftReminder(owner, null, message.draft, id);
      break;
    }
    case 'edit-reminder': if (item) draftReminder(owner, item); break;
    case 'parse': {
      const form = button.form;
      setSentence(form.elements.sentence.value, form);
      break;
    }
    case 'complete':
      if (item) refresh(finishReminder(item));
      break;
    case 'calendar': if (item) downloadReminder(item); break;
    case 'remove-reminder': {
      if (item) showDialog('删除这条提醒？', `<p class="share-preview">${escapeHtml(item.title)}</p><div class="dialog-actions"><button class="button quiet" type="button" data-action="edit-reminder" data-id="${id}">返回</button><button class="button danger" type="button" data-action="delete-confirmed" data-id="${id}">删除</button></div>`);
      break;
    }
    case 'delete-confirmed': state.reminders = state.reminders.filter((entry) => entry.id !== id); refresh('提醒已删除。'); break;
    case 'share': void openShareItem('question', id); break;
    case 'share-device': void openShareItem('device', id); break;
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!form.dataset.form) return;
  event.preventDefault();
  const data = new FormData(form);
  switch (form.dataset.form) {
    case 'electricity-publish': void electricity.submit('publish'); break;
    case 'electricity-help': void electricity.submit('help'); break;
    case 'email-login': void submitEmailLogin(form, data); break;
    case 'scene-record':
      if (event.submitter?.value === 'analyze') void records.analyze(data);
      else void records.save(data);
      break;
    case 'family-shortcut': void submitShortcut(form, data); break;
    case 'family-permission': void saveFamilyPermission(form, data); break;
    case 'join-family':
    case 'share-family': void familyForm(form, data); break;
    case 'device-guide': saveDeviceGuide(form); break;
    case 'message': sendMessage(data.get('message')); break;
    case 'persona':
      state.persona = data.get('persona');
      state.speechRate = data.get('speech-rate');
      state.interests = data.get('interests').trim();
      refresh('助手设置已保存。');
      break;
    case 'care':
      state.monitoring = data.has('monitoring');
      state.quietDays = Number(data.get('days'));
      demoLastSeen = null;
      refresh('关怀设置已保存。');
      break;
    case 'contact': {
      const phone = data.get('phone').trim().replace(/[\s-]/g, '');
      const name = data.get('name').trim();
      if (!name || !/^\+?\d{5,18}$/.test(phone)) {
        form.querySelector('.form-error').textContent = '请填写称呼和可拨打的电话号码。';
        return;
      }
      state.contactName = name;
      state.phone = phone;
      refresh('家人电话已保存。');
      break;
    }
    case 'reminder': {
      const at = new Date(`${data.get('date')}T${data.get('time')}`).getTime();
      const title = data.get('title').trim();
      const id = form.dataset.id || crypto.randomUUID();
      const previous = state.reminders.find((item) => item.id === id);
      if (!title || !Number.isFinite(at) || (at <= Date.now() && previous?.at !== at)) {
        form.querySelector('.form-error').textContent = '请填写提醒内容，并选择还没到的时间。';
        return;
      }
      const repeat = data.get('repeat');
      const item = { id, owner: form.dataset.owner, at, title, repeat, done: repeat === 'never' && Boolean(previous?.done), notified: previous?.at === at && previous.notified };
      state.reminders = [...state.reminders.filter((entry) => entry.id !== id), item];
      refresh('提醒已保存。');
      break;
    }
  }
});

document.addEventListener('input', (event) => {
  if (event.target.matches('[data-electricity-field], [data-electricity-step]')) electricity.input(event.target);
});

document.addEventListener('change', async (event) => {
  const field = event.target;
  if (field.matches('select[data-electricity-field]')) { electricity.input(field); return; }
  if (field.matches('[data-electricity-file]')) { await electricity.file(field); return; }
  if (field.id === 'shortcut-kind') {
    const custom = field.form.querySelector('[data-shortcut-custom]');
    custom.hidden = field.value !== 'website';
    for (const input of custom.querySelectorAll('input')) input.required = !custom.hidden;
    field.form.elements.title.required = !custom.hidden;
    field.form.elements.target.disabled = custom.hidden;
    return;
  }
  if (field.name === 'persona' && field.form?.dataset.form === 'persona') {
    field.form.querySelector('.persona-preview').textContent = personas[field.value].preview;
    return;
  }
  if (field.id === 'capture-album' || field.id === 'capture-native') { await records.readFile(field); return; }
  if (field.id !== 'device-file' || !field.files.length) return;
  const editor = deviceEditor;
  const form = field.form;
  const frame = form.querySelector('#guide-photo');
  const submit = form.querySelector('button[type="submit"]');
  editor.loading = true;
  field.disabled = true;
  submit.disabled = true;
  frame.setAttribute('aria-busy', 'true');
  guideError('');
  try {
    const photo = await readDevicePhoto(field.files[0]);
    if (deviceEditor !== editor) return;
    editor.photo = photo;
    editor.pin = null;
    // The locations from a different photo may no longer point to the same buttons.
    for (const step of editor.steps) {
      step.x = null;
      step.y = null;
    }
    frame.innerHTML = editorPhotoContent(form.elements.name.value || '家里的设备');
    form.querySelector('#guide-steps').innerHTML = editorStepRows();
    form.querySelector('#pin-status').textContent = '照片已就绪，请标记按键。';
  } catch (error) {
    if (deviceEditor === editor) guideError(error instanceof DOMException ? '这张照片打不开，请换一张清楚的照片。' : error.message);
  } finally {
    editor.loading = false;
    field.disabled = false;
    field.value = '';
    submit.disabled = false;
    frame.removeAttribute('aria-busy');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.target.matches('[data-action="electricity-pin"]')) { electricity.adjustPin(event); return; }
  if (!event.target.matches('.photo-target[data-action="device-pin"]')) return;
  const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (!offsets[event.key]) return;
  event.preventDefault();
  const [dx, dy] = offsets[event.key];
  const { x, y } = deviceEditor.pin ?? { x: 0.5, y: 0.5 };
  const adjust = (coordinate, offset) => Math.max(0, Math.min(1, coordinate + offset * 0.025));
  updatePin(event.target.form, { x: adjust(x, dx), y: adjust(y, dy) });
});

dialog.addEventListener('close', () => {
  if (returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
});

function enterScreen(focus = false) {
  if (!account) return;
  const id = routeDeviceId();
  if (recordRoutes.includes(route)) records.open(route, id, location.hash.split('/')[3]);
  else records.close();
  deviceStep = 0;
  deviceEditor = null;
  if (route === 'guide' && state.guideRuns[id]?.screen === 'done') {
    delete state.guideRuns[id];
    save();
  }
  if (route === 'device-editor') {
    const stored = state.deviceGuides.find((item) => item.id === id);
    if (stored || !id) deviceEditor = { name: '', photo: '', steps: [], ...structuredClone(stored ?? {}), pin: null, stepIndex: null, loading: false };
  }
  if (route === 'chat' && !state.greeted) { state.greeted = true; save(); }
  noteActivity();
  void electricity.open(route, id);
  render();
  if (familyPages.includes(route)) void loadFamily();
  if (route === 'electricity-editor' && !id && !family) {
    const active = account;
    void loadFamily().then(() => { if (account === active && route === 'electricity-editor' && !routeDeviceId()) render(); });
  }
  if (route === 'family-overview') void loadOverview();
  else overview = null;
  if (focus) {
    window.scrollTo(0, 0);
    document.querySelector('#screen-title')?.focus({ preventScroll: true });
  }
  checkReminders();
}

window.addEventListener('hashchange', () => {
  if (dialog.open) dialog.close();
  recognition?.abort();
  phoneGuide.close();
  stopSpeech();
  route = readRoute();
  if (!cloudSite && location.hash === '#/legacy' && !authBusy) { void boot(); return; }
  authPanel = false;
  enterScreen(true);
});
document.addEventListener('visibilitychange', () => {
  noteActivity();
  if (account && document.visibilityState === 'visible') {
    if (route === 'elder') void loadFamily();
    if (['elder', 'family', 'home-shortcuts', 'electricity-cards'].includes(route)) void electricity.refresh();
    if (route === 'family-overview') void loadOverview();
  }
  if (account) checkReminders();
});
window.addEventListener('pagehide', records.stopCamera);
window.addEventListener('pagehide', electricity.stopMedia);
window.addEventListener('pagehide', phoneGuide.close);
window.addEventListener('heban-guide-result', (event) => phoneGuide.applyNativeResult(event.detail));
window.addEventListener('pageshow', (event) => {
  if (event.persisted && route === 'capture') void records.action('capture-reset');
});
window.addEventListener('beforeunload', (event) => {
  if (unsyncedCloud()) { event.preventDefault(); event.returnValue = ''; }
});
setInterval(() => { if (account) checkReminders(); }, 10_000);
window.speechSynthesis?.getVoices?.();
if (!cloudSite) cloudEntry();
void boot();
