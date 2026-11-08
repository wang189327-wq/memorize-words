/** IndexedDB record transactions; retain old snapshots until migration is verified. */
(function (root) {
  'use strict';
  if (root.AndroidStore) return;
  const R = root.WordMemoRecords,
    stores = [...R.tables, 'metadata'];
  let db,
    pending = 0,
    lastError = null,
    chain = Promise.resolve();
  const ready = new Promise((resolve, reject) => {
    const request = indexedDB.open('ielts75-local', 2);
    request.onupgradeneeded = () => {
      for (const name of [...stores, 'records'])
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('请先关闭其他旧版词记标签页，再刷新完成存储升级。'));
    request.onsuccess = () => {
      db = request.result;
      db.onversionchange = () => {
        db.close();
        root.onNativeStatus?.('存储版本已更新，请刷新后继续。');
      };
      resolve();
    };
  });
  function transaction(names, mode, action) {
    return ready.then(
      () =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(names, mode);
          let result;
          tx.oncomplete = () => resolve(result);
          tx.onerror = tx.onabort = () =>
            reject(tx.error || Error('本地事务未完成，原记录保持不变。'));
          try {
            action(tx, (value) => {
              result = value;
            });
          } catch (error) {
            tx.abort();
            reject(error);
          }
        }),
    );
  }
  function queued(action) {
    pending++;
    chain = chain
      .catch(() => {})
      .then(action)
      .then(
        (value) => {
          lastError = null;
          return value;
        },
        (error) => {
          lastError = error;
          throw error;
        },
      )
      .finally(() => pending--);
    chain.catch(() => {});
    return chain;
  }
  const get = (key) =>
    transaction(['records'], 'readonly', (tx, done) => {
      tx.objectStore('records').get(key).onsuccess = (event) => done(event.target.result);
    });
  function read() {
    return transaction(stores, 'readonly', (tx, done) => {
      const data = {},
        meta = {};
      let remaining = stores.length;
      const finish = () => {
        if (!--remaining) done(R.assemble(data, meta));
      };
      for (const name of R.tables) {
        const rows = [];
        tx.objectStore(name).openCursor().onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            rows.push([cursor.key, cursor.value]);
            cursor.continue();
          } else {
            data[name] = rows;
            finish();
          }
        };
      }
      tx.objectStore('metadata').get('active').onsuccess = (event) => {
        Object.assign(meta, event.target.result);
        finish();
      };
    });
  }
  function write(patch) {
    return transaction(stores, 'readwrite', (tx) => {
      const metadata = tx.objectStore('metadata');
      metadata.get('active').onsuccess = (event) => {
        try {
          const current = event.target.result;
          if (!patch.replace && current?.bookId !== patch.expectedBookId) {
            tx.abort();
            return;
          }
          if (patch.replace) for (const table of R.tables) tx.objectStore(table).clear();
          for (const [table, rows] of Object.entries(patch.puts))
            for (const [key, value] of rows) tx.objectStore(table).put(value, key);
          for (const [table, keys] of Object.entries(patch.deletes))
            for (const key of keys) tx.objectStore(table).delete(key);
          metadata.put(
            { bookId: patch.bookId, state: patch.metadata || current?.state || {} },
            'active',
          );
        } catch {
          // Exceptions inside IDB callbacks must abort instead of escaping as page errors.
          tx.abort();
        }
      };
    });
  }
  root.BrowserStore = {
    ready,
    get,
    put: (key, value) =>
      queued(() =>
        transaction(['records'], 'readwrite', (tx) => tx.objectStore('records').put(value, key)),
      ),
    commit: (patch) => queued(() => write(patch)),
    async load() {
      await chain.catch(() => {});
      const current = await read();
      if (current) return JSON.stringify(current);
      const raw = (await get('state')) || localStorage.getItem('ielts75-state-v1');
      if (!raw) return '';
      const migrated = await R.normalizeLegacy(root.WordMemo.validateState(JSON.parse(raw)));
      await this.commit(R.patch(migrated, null, true));
      const verified = root.WordMemo.validateState(await read());
      if (
        verified.deck.cards.length !== migrated.deck.cards.length ||
        verified.results.length !== migrated.results.length
      )
        throw Error('迁移核验未通过，已保留旧记录。');
      await transaction(['records'], 'readwrite', (tx) => {
        for (const key of ['state', 'before-restore', 'before-update', 'cloud-book'])
          tx.objectStore('records').delete(key);
      });
      for (const key of ['ielts75-state-v1', 'ielts75-before-restore', 'ielts75-before-update'])
        localStorage.removeItem(key);
      return JSON.stringify(verified);
    },
    async save(raw) {
      const next = await R.normalizeLegacy(root.WordMemo.validateState(JSON.parse(raw)));
      await this.commit(R.patch(next, null, true));
      return true;
    },
    flush: () => chain,
    status: () => ({ pending, error: lastError?.message || null }),
  };
  root.addEventListener('beforeunload', (event) => {
    if (pending || lastError) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
})(window);
