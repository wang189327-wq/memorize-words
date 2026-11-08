(function (root) {
  'use strict';
  const KEY = 'ielts75-cloud-config';
  let running = false,
    lastError = '';
  const digest = async (text) =>
    Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
  const config = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch {
      return {};
    }
  };
  const saveConfig = (c) => localStorage.setItem(KEY, JSON.stringify(c));
  const endpoint = (s) => {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash)
      throw Error('请输入HTTPS服务器地址');
    return u.href.replace(/\/$/, '');
  };
  async function request(path, body, c = config()) {
    const response = await fetch(endpoint(c.api) + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(c.token ? { Authorization: 'Bearer ' + c.token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    if (!response.ok) {
      const e = Error(data.error || '云端请求失败');
      e.status = response.status;
      throw e;
    }
    return data;
  }
  function disconnect() {
    const c = config(),
      refreshToken = c.refreshToken;
    delete c.token;
    delete c.refreshToken;
    c.enabled = false;
    saveConfig(c);
    lastError = '';
    if (refreshToken) request('/v1/logout', { refreshToken }, c).catch(() => {});
  }
  async function login({ api, username, password, registrationCode, register = false }) {
    const c = { api: endpoint(api), enabled: false };
    const data = await request(
      register ? '/v1/register' : '/v1/login',
      { username, password, ...(register ? { registrationCode } : {}) },
      c,
    );
    saveConfig({
      ...c,
      token: data.token,
      refreshToken: data.refreshToken,
      username: data.username,
      enabled: true,
    });
    lastError = '';
    return data;
  }
  async function renew(c) {
    let exp = 0;
    try {
      exp = JSON.parse(atob(c.token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).exp || 0;
    } catch {}
    if (c.refreshToken && exp * 1000 > Date.now() + 86400000) return c;
    let data;
    try {
      data = await request(
        c.refreshToken ? '/v1/refresh' : '/v1/session',
        c.refreshToken ? { refreshToken: c.refreshToken } : {},
        c,
      );
    } catch (e) {
      if (e.status === 404) return c;
      throw e;
    }
    const latest = config();
    if (!latest.enabled || latest.token !== c.token || latest.api !== c.api)
      throw Error('账号状态已改变');
    const next = {
      ...latest,
      token: data.token,
      refreshToken: data.refreshToken || c.refreshToken,
    };
    saveConfig(next);
    return next;
  }
  async function sync() {
    let c = config();
    if (running || !c.enabled || !c.token || !root.ieltsSyncState) return;
    const initial = root.ieltsSyncState();
    if (!initial) return;
    running = true;
    try {
      c = await renew(c);
      const syncRequest = (path, body) => {
        const latest = config();
        if (!latest.enabled || latest.api !== c.api || latest.token !== c.token)
          throw Error('账号状态已改变');
        return request(path, body, c);
      };
      if (initial.results.some((r) => !r.eventId)) {
        const normalized = await Promise.all(
          initial.results.map(async (r, i) =>
            r.eventId
              ? r
              : { ...r, eventId: 'legacy-' + (await digest(JSON.stringify(r) + '|' + i)) },
          ),
        );
        if (root.ieltsSyncState() !== initial) throw Error('学习记录正在变化，稍后自动重试');
        if (!(await root.ieltsApplySync({ ...initial, results: normalized }, true)))
          throw Error('旧复习记录迁移保存失败');
      }
      const fingerprint = await digest(
        initial.deck.bookId +
          '\n' +
          initial.deck.cards
            .map((x) => x.id)
            .sort()
            .join('\n'),
      );
      const book = initial.deck.bookId,
        valid = new Set(initial.deck.cards.map((x) => x.id));
      const favoritePath = '/v1/favorites/' + encodeURIComponent(book),
        remoteFavorites = [];
      let favoriteCursor = '';
      do {
        let data;
        try {
          data = await syncRequest(
            favoritePath +
              '?fingerprint=' +
              fingerprint +
              (favoriteCursor ? '&cursor=' + encodeURIComponent(favoriteCursor) : ''),
          );
        } catch (e) {
          if (e.status === 404) throw Error('阿里云后端尚未支持收藏同步，请先部署1.4同步包');
          throw e;
        }
        if (data.favoritesSync !== true || !Array.isArray(data.records))
          throw Error('请先更新阿里云1.4收藏同步后端');
        remoteFavorites.push(...data.records);
        favoriteCursor = data.next || '';
      } while (favoriteCursor);
      const remoteLearned = {},
        remoteResults = new Map();
      let cursor = '';
      do {
        const data = await syncRequest(
          '/v1/progress/' +
            encodeURIComponent(book) +
            '?fingerprint=' +
            fingerprint +
            (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
        );
        for (const r of data.records) {
          if (!valid.has(r.id)) continue;
          if (r.kind === 'learned') remoteLearned[r.id] = { date: r.date };
          else {
            const { kind, ...record } = r;
            remoteResults.set(r.eventId, record);
          }
        }
        cursor = data.next || '';
      } while (cursor);
      if (!config().enabled || config().token !== c.token) throw Error('账号状态已改变');
      let current = root.ieltsSyncState();
      if (!current || current.deck.bookId !== book) throw Error('同步期间词库已改变，请重试');
      const learned = { ...current.learned };
      for (const [id, r] of Object.entries(remoteLearned))
        if (!learned[id] || r.date < learned[id].date) learned[id] = r;
      const results = current.results;
      const mergedResults = new Map(results.map((r) => [r.eventId, r]));
      for (const [id, r] of remoteResults) if (!mergedResults.has(id)) mergedResults.set(id, r);
      let merged = root.WordMemo.mergeFavorites(
        root.WordMemo.prepareFavorites({
          ...current,
          learned,
          results: [...mergedResults.values()]
            .sort(
              (a, b) =>
                (a.at || a.date).localeCompare(b.at || b.date) ||
                a.eventId.localeCompare(b.eventId),
            )
            .slice(-50000),
        }),
        remoteFavorites,
      );
      if (
        JSON.stringify(merged) !== JSON.stringify(current) &&
        !(await root.ieltsApplySync(merged))
      )
        throw Error('本地同步保存失败');
      const uploads = [];
      for (const [id, r] of Object.entries(merged.learned))
        if (!remoteLearned[id] || r.date < remoteLearned[id].date)
          uploads.push({ kind: 'learned', id, date: r.date });
      for (const r of merged.results)
        if (!remoteResults.has(r.eventId)) {
          const { id, mode, correct, date, at, eventId } = r;
          uploads.push({ kind: 'result', id, mode, correct, date, ...(at ? { at } : {}), eventId });
        }
      // An empty batch registers the fingerprint without transferring any book content.
      for (let i = 0; i < Math.max(uploads.length, 1); i += 100) {
        const batch = uploads.slice(i, i + 100);
        await syncRequest('/v1/progress/' + encodeURIComponent(book), {
          fingerprint,
          learned: batch.filter((r) => r.kind === 'learned').map(({ kind, ...r }) => r),
          results: batch.filter((r) => r.kind === 'result').map(({ kind, ...r }) => r),
        });
      }
      const remoteFavoriteMap = new Map(remoteFavorites.map((r) => [r.id, r]));
      const favoriteUploads = Object.entries(merged.favoriteChanges || {})
        .map(([id, r]) => ({ id, ...r }))
        .filter((r) => JSON.stringify(r) !== JSON.stringify(remoteFavoriteMap.get(r.id)));
      for (let i = 0; i < favoriteUploads.length; i += 100) {
        const data = await syncRequest(favoritePath, {
          fingerprint,
          favorites: favoriteUploads.slice(i, i + 100),
        });
        if (!Array.isArray(data.records)) throw Error('收藏同步响应无效，请重试');
        merged = root.WordMemo.mergeFavorites(merged, data.records);
      }
      lastError = '';
      const latest = config();
      if (latest.enabled && latest.api === c.api && latest.token === c.token) {
        if ((await root.onCloudSyncSaved?.(merged)) === false)
          throw Error('云端已同步，但本地保存失败，请重试');
        if (root.BrowserStore) await root.BrowserStore.flush();
        saveConfig({ ...config(), lastSync: new Date().toISOString() });
      }
    } catch (e) {
      try {
        localStorage.setItem('ielts75-sync-dirty', '1');
      } catch {}
      lastError = e.message;
      root.onNativeStatus?.('进度同步未完成：' + e.message + '。本地记录保留。');
      throw e;
    } finally {
      running = false;
    }
  }
  // Progress synchronization is explicitly requested by the user, never scheduled.

  root.WordMemoSync = {
    config,
    login,
    disconnect,
    sync,
    status: () => ({ running, error: lastError }),
  };
})(window);
