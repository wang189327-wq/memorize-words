/** settings: see docs/architecture.md for responsibilities. */
import { runtime } from './runtime.js';
import { C, append, btn, el, host, toast } from './dom.js';
import { render, setTab } from './navigation.js';
import { cloudMode, rebuildQueue } from './state.js';
import { exportBackup, exportEncryptedBackup, requestImport } from './backup.js';
import { offlineStatus, checkOfflineUpdate } from '../offline.js';

export const appearanceKey = 'ielts75-appearance',
  themes = {
    mist: { label: '清新灰白', page: '#f5f8f8', card: '#ffffff' },
    cream: { label: '暖米色', page: '#f4eddd', card: '#fffaf0' },
    green: { label: '浅豆绿', page: '#e7f1e7', card: '#f5faf2' },
    pink: { label: '柔和粉', page: '#f6e9ed', card: '#fff7f9' },
  };

export function applyAppearance(save = false) {
  const theme = themes[runtime.appearance.theme],
    style = document.documentElement.style;
  style.setProperty('--reading-scale', String(runtime.appearance.size / 16));
  style.setProperty('--paper', theme.page);
  style.setProperty('--card-background', theme.card);
  if (save)
    try {
      localStorage.setItem(appearanceKey, JSON.stringify(runtime.appearance));
    } catch {
      toast('显示设置保存失败，请检查设备空间。');
    }
}

export const collapsedSettings = new Set(['词库资源', '学习进度', '本地学习记录', '基础设置']);

export const expandedBookResources = new Set();

export function renderBookResources() {
  const panel = append(el('section', 'panel'), el('h2', '', '词库资源')),
    list = el('div', 'book-resource-list');
  // List-shaped resource UI; the current data model supplies the installed book.
  const books = runtime.state?.deck ? [runtime.state.deck] : [];
  for (const book of books) {
    const bookId = String(book.bookId),
      title = book.title;
    const item = el('div', 'book-resource'),
      detail = el('div', 'book-resource-details');
    detail.id = 'book-resource-' + bookId.replace(/[^a-zA-Z0-9_-]/g, '-');
    const cover = el('span', 'book-cover'),
      image = el('img');
    image.alt = title + '封面';
    image.width = 86;
    image.height = 130;
    if (book.cover?.startsWith('data:image/')) {
      image.src = book.cover;
      image.onerror = () => {
        image.remove();
        cover.append(el('span', 'book-cover-fallback', title));
      };
      cover.append(image);
    } else cover.append(el('span', 'book-cover-fallback', title));
    const open = btn(
      '',
      () => {
        detail.hidden = !detail.hidden;
        open.setAttribute('aria-expanded', String(!detail.hidden));
        if (detail.hidden) expandedBookResources.delete(bookId);
        else expandedBookResources.add(bookId);
      },
      'book-resource-open',
    );
    open.setAttribute('aria-label', '查看《' + title + '》');
    open.setAttribute('aria-controls', detail.id);
    detail.hidden = !expandedBookResources.has(bookId);
    open.setAttribute('aria-expanded', String(!detail.hidden));
    append(open, cover, el('span', 'book-resource-title', title));
    append(
      detail,
      el('p', 'book-resource-count', '已收录 ' + book.cards.length + ' 张词卡'),
      btn(
        '学习本书',
        () => {
          if (runtime.state.deck.bookId !== book.bookId) return;
          runtime.librarySentence = '';
          runtime.libraryQuery = '';
          runtime.libraryCard = null;
          setTab('library');
        },
        'primary wide',
      ),
    );
    append(item, open, detail);
    append(list, item);
  }
  append(
    panel,
    list,
    btn('导入本地词库', () => requestImport('deck'), 'wide'),
  );
  return panel;
}

export function makeSettingsCollapsible() {
  for (const panel of host.querySelectorAll('.panel')) {
    if (panel.querySelector(':scope > .settings-card-head')) continue;
    const title = panel.querySelector(':scope > h2');
    if (!title) continue;
    const key = title.textContent,
      head = el('div', 'settings-card-head'),
      body = el('div', 'settings-card-body');
    const toggle = btn(
      '',
      () => {
        const closed = !body.hidden;
        body.hidden = closed;
        toggle.setAttribute('aria-expanded', String(!closed));
        toggle.setAttribute('aria-label', (closed ? '展开' : '收起') + key);
        panel.classList.toggle('settings-collapsed', closed);
        if (closed) collapsedSettings.add(key);
        else collapsedSettings.delete(key);
      },
      'settings-card-toggle',
    );
    const icon = el('span', 'fold-icon', '▲');
    icon.setAttribute('aria-hidden', 'true');
    toggle.append(icon);
    const closed = collapsedSettings.has(key);
    body.hidden = closed;
    toggle.setAttribute('aria-expanded', String(!closed));
    toggle.setAttribute('aria-label', (closed ? '展开' : '收起') + key);
    panel.classList.toggle('settings-collapsed', closed);
    for (const node of [...panel.childNodes]) if (node !== title) body.append(node);
    append(head, title, toggle);
    panel.replaceChildren(head, body);
  }
}

export function renderSettings() {
  append(host, el('h1', 'page-title', '设置'), renderBookResources());
  if (runtime.storageMode === 'cloud') renderSyncSettings();
  if (!cloudMode()) {
    append(
      host,
      append(
        el('section', 'panel'),
        el('h2', '', '本地学习记录'),
        btn('导出完整备份', exportBackup, 'wide primary'),
        btn('导出加密备份', exportEncryptedBackup, 'wide'),
        btn('从备份恢复', () => requestImport('restore'), 'wide'),
        el(
          'p',
          'muted',
          '学习进度自动保存到本机，只保留最新一份。手动导出的文件由你自行管理；卸载或清除应用数据会删除本机记录。',
        ),
      ),
    );
  }
  append(host, renderAppearanceSettings());
  if (runtime.storageMode !== 'cloud')
    append(
      host,
      btn(
        '启用云端进度同步',
        () => {
          runtime.storageMode = 'cloud';
          localStorage.setItem('ielts75-mode', 'cloud');
          render();
        },
        'wide',
      ),
    );
  makeSettingsCollapsible();
}

export function renderStorageChoice() {
  const panel = el('section', 'panel');
  append(
    panel,
    el('h1', 'page-title', '选择使用方式'),
    el('p', '', '书籍与词卡保存在本设备，按你的需要选择进度保存方式。'),
    btn(
      '仅本地使用 · 无需账号',
      () => {
        runtime.storageMode = 'local';
        localStorage.setItem('ielts75-mode', 'local');
        window.WordMemoSync?.disconnect();
        render();
      },
      'primary wide',
    ),
    btn(
      '云端同步进度 · 多设备共用账号',
      () => {
        runtime.storageMode = 'cloud';
        localStorage.setItem('ielts75-mode', 'cloud');
        runtime.tab = 'settings';
        render();
      },
      'wide',
    ),
  );
  append(host, panel);
}

export function renderEmptyBook() {
  const panel = el('section', 'panel');
  append(
    panel,
    el('h1', 'page-title', '添加本地图书'),
    el('p', '', '本软件不附带商业图书内容。请从设备中导入已整理的JSON词库，或导入完整备份。'),
    el(
      'p',
      'muted',
      '当前不提供OCR，无法直接识别PDF、图片或EPUB。上传只写入本浏览器本地存储，不会把书籍上传到服务器。',
    ),
    btn('选择JSON词库', () => requestImport('deck'), 'primary wide'),
    btn('恢复完整备份', () => requestImport('restore'), 'wide'),
  );
  append(host, panel);
  if (runtime.storageMode === 'cloud') renderSyncSettings();
  else
    append(
      host,
      btn(
        '切换使用方式',
        () => {
          runtime.storageMode = '';
          render();
        },
        'text-button',
      ),
    );
}

export function renderAppearanceSettings() {
  const panel = el('section', 'panel');
  append(
    panel,
    el('h2', '', '基础设置'),
    el('p', 'muted', '字号与背景色仅保存在本机，调整后立即生效。'),
  );
  const size = el('input');
  size.type = 'range';
  size.id = 'reading-size';
  size.min = '14';
  size.max = '22';
  size.step = '2';
  size.value = runtime.appearance.size;
  size.setAttribute('aria-label', '阅读字号');
  const output = el('output', '', runtime.appearance.size + ' px');
  output.htmlFor = size.id;
  size.oninput = () => {
    runtime.appearance.size = Number(size.value);
    output.textContent = runtime.appearance.size + ' px';
    applyAppearance(true);
  };
  const colors = el('select');
  colors.id = 'reading-theme';
  colors.setAttribute('aria-label', '背景色');
  for (const [value, theme] of Object.entries(themes)) {
    const option = el('option', '', theme.label);
    option.value = value;
    colors.append(option);
  }
  colors.value = runtime.appearance.theme;
  colors.onchange = () => {
    runtime.appearance.theme = colors.value;
    applyAppearance(true);
  };
  append(
    panel,
    append(el('label', 'appearance-field'), el('span', '', '字号'), size, output),
    append(el('label', 'appearance-field'), el('span', '', '背景色'), colors),
  );
  const version = btn(
    '检查版本',
    async () => {
      if (version.disabled) return;
      version.disabled = true;
      version.textContent = '正在检查…';
      try {
        const info = await window.WordMemoUpdate.check();
        if (!info.hasUpdate) {
          toast('当前已是最新版本 ' + window.WordMemoUpdate.version);
          return;
        }
        const dialog = el('dialog');
        append(
          dialog,
          el('h2', '', '发现新版本 ' + info.versionName),
          el('p', '', info.notes || '可下载新版安装包，覆盖安装。'),
          el(
            'p',
            'muted',
            '更新包不附带书籍，将继续使用本机已有词库。请先保存未同步的学习记录，安装时不要卸载。',
          ),
          btn(
            '下载更新',
            () => {
              window.WordMemoUpdate.download(info);
              dialog.close();
              dialog.remove();
            },
            'primary wide',
          ),
          btn(
            '稍后',
            () => {
              dialog.close();
              dialog.remove();
            },
            'wide',
          ),
        );
        dialog.addEventListener('cancel', () => dialog.remove());
        document.body.append(dialog);
        dialog.showModal();
      } catch (e) {
        toast(
          e.name === 'AbortError' ? '检查更新超时，请稍后再试。' : '检查更新失败：' + e.message,
        );
      } finally {
        version.disabled = false;
        version.textContent = '检查版本';
      }
    },
    'wide',
  );
  append(panel, el('p', 'muted', '当前版本 ' + window.WordMemoUpdate.version), version);
  if (!window.AndroidStore)
    append(
      panel,
      el('p', 'muted', offlineStatus),
      btn(
        '检查离线网页更新',
        async () => {
          if (!(await checkOfflineUpdate())) toast('未发现可应用的离线网页更新。');
        },
        'wide',
      ),
    );
  return panel;
}

export function renderSyncSettings() {
  const cloud = window.WordMemoSync;
  if (!cloud) return;
  const cfg = cloud.config(),
    panel = el('section', 'panel');
  append(panel, el('h2', '', '学习进度'));
  if (runtime.storageMode === 'local') {
    append(
      panel,
      el('p', '', '当前：仅本地使用，无需账号。'),
      btn(
        '启用云端进度同步',
        () => {
          runtime.storageMode = 'cloud';
          localStorage.setItem('ielts75-mode', 'cloud');
          render();
        },
        'wide',
      ),
    );
    append(host, panel);
    return;
  }
  if (cfg.enabled && cfg.token) {
    append(
      panel,
      el('p', '', '账号：' + cfg.username),
      el(
        'p',
        'muted',
        cfg.lastProgressSync
          ? '进度与收藏：' + new Date(cfg.lastProgressSync).toLocaleString()
          : '进度与收藏尚未同步',
      ),
      el(
        'p',
        'muted',
        cfg.ratingSupported === false
          ? '智能复习：需更新同步后端'
          : cfg.lastRatingSync
            ? '智能复习：' + new Date(cfg.lastRatingSync).toLocaleString()
            : '智能复习尚未同步',
      ),
      el(
        'p',
        'muted',
        cfg.lastSync ? '上次同步：' + new Date(cfg.lastSync).toLocaleString() : '尚未同步',
      ),
      btn(
        '同步进度',
        async () => {
          try {
            await cloud.sync();
            toast('学习进度已同步');
            render();
          } catch {}
        },
        'primary wide',
      ),
      btn(
        '退出云端账号',
        () =>
          window.requestAppExit(async () => {
            cloud.disconnect();
            runtime.storageMode = 'local';
            localStorage.setItem('ielts75-mode', 'local');
            const raw = window.AndroidStore
              ? window.AndroidStore.load()
              : window.BrowserStore
                ? await window.BrowserStore.load()
                : localStorage.getItem('ielts75-state-v1');
            runtime.state = raw
              ? C.validateState(JSON.parse(raw))
              : C.emptyState(runtime.state.deck);
            runtime.session = null;
            rebuildQueue();
            render();
          }),
        'wide',
      ),
    );
    append(host, panel);
    return;
  }
  const fields = {};
  for (const [name, label, type] of [
    ['api', '云端服务器地址', 'url'],
    ['username', '账号', 'text'],
    ['password', '密码（至少10位）', 'password'],
    ['registrationCode', '注册邀请码（仅注册时填写）', 'password'],
  ]) {
    const input = el('input');
    input.type = type;
    input.id = 'sync-' + name;
    input.placeholder = label;
    input.setAttribute('aria-label', label);
    input.autocomplete =
      name === 'password' ? 'current-password' : name === 'username' ? 'username' : 'off';
    if (name === 'api') input.value = cfg.api || window.WORDMEMO_CONFIG.defaultApi || '';
    if (name === 'username') input.value = cfg.username || '';
    fields[name] = input;
    append(panel, append(el('label', 'sync-field'), el('span', '', label), input));
  }
  const connect = async (register) => {
    const action = panel.querySelectorAll('button');
    action.forEach((b) => (b.disabled = true));
    try {
      await cloud.login({
        ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.value])),
        register,
      });
      toast(register ? '账号已注册' : '已登录');
      render();
    } catch (e) {
      toast(e.message);
    } finally {
      action.forEach((b) => (b.disabled = false));
    }
  };
  append(
    panel,
    btn('登录账号', () => connect(false), 'primary wide'),
    btn('注册一个账号', () => connect(true), 'wide'),
    btn(
      '改为仅本地使用',
      () => {
        cloud.disconnect();
        runtime.storageMode = 'local';
        localStorage.setItem('ielts75-mode', 'local');
        render();
      },
      'text-button',
    ),
  );
  append(host, panel);
}
