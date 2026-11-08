(function (root) {
  'use strict';
  if (root.AndroidStore) return;
  let db,
    pending = 0,
    lastError = null,
    chain = Promise.resolve();
  const ready = new Promise((resolve, reject) => {
    const request = indexedDB.open('ielts75-local', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };
  });
  function tx(mode, action) {
    return ready.then(
      () =>
        new Promise((resolve, reject) => {
          const t = db.transaction('records', mode),
            s = t.objectStore('records');
          let result;
          const r = action(s);
          if (r) r.onsuccess = () => (result = r.result);
          t.oncomplete = () => resolve(result);
          t.onerror = () => reject(t.error || Error('本地数据库写入失败'));
          t.onabort = () => reject(t.error || Error('本地数据库已取消'));
        }),
    );
  }
  function put(key, value) {
    pending++;
    chain = chain
      .catch(() => {})
      .then(() =>
        tx('readwrite', (s) =>
          (() => {
            const req = s.put(value, key);
            if (key === 'state') {
              s.delete('before-restore');
              s.delete('before-update');
              s.delete('cloud-book');
            }
            return req;
          })(),
        ),
      )
      .then(
        () => {
          lastError = null;
        },
        (e) => {
          lastError = e;
          if (root.onNativeStatus)
            root.onNativeStatus('本地保存失败：' + e.message + '，请立即导出备份。');
          throw e;
        },
      )
      .finally(() => pending--);
    chain.catch(() => {});
    return chain;
  }
  root.BrowserStore = {
    async load() {
      await ready;
      const raw = await tx('readonly', (s) => s.get('state'));
      if (raw) {
        localStorage.removeItem('ielts75-state-v1');
        localStorage.removeItem('ielts75-before-restore');
        localStorage.removeItem('ielts75-before-update');
        await tx('readwrite', (s) => {
          s.delete('before-restore');
          s.delete('before-update');
          s.delete('cloud-book');
        });
        return raw;
      }
      const old = localStorage.getItem('ielts75-state-v1');
      if (old) {
        await put('state', old);
        return old;
      }
      return '';
    },
    async save(raw) {
      await put('state', raw);
      localStorage.removeItem('ielts75-state-v1');
      localStorage.removeItem('ielts75-before-restore');
      localStorage.removeItem('ielts75-before-update');
      return true;
    },
    flush: () => chain,
    ready,
    get: (key) => tx('readonly', (s) => s.get(key)),
    put,
    status: () => ({ pending, error: lastError?.message || null }),
  };
  root.addEventListener('beforeunload', (e) => {
    if (pending || lastError) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
})(window);
