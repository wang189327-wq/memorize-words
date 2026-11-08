'use strict';
const http = require('node:http'),
  crypto = require('node:crypto'),
  { promisify } = require('node:util'),
  { Conflict, aliyunStore } = require('./store.cjs');
const scrypt = promisify(crypto.scrypt),
  hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const { algorithm, validateRating, canonicalRating } = require('./rating-contract.cjs');
const error = (status, message) => Object.assign(Error(message), { status });
const validDate = (x) =>
  typeof x === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  !isNaN(Date.parse(x + 'T12:00:00Z')) &&
  new Date(x + 'T12:00:00Z').toISOString().slice(0, 10) === x;
const equal = (a, b) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const validId = (id) =>
  typeof id === 'string' &&
  /^[a-zA-Z0-9_-]{1,200}$/.test(id) &&
  !Object.prototype.hasOwnProperty.call(Object.prototype, id) &&
  id !== 'prototype';
function createApp({ store, env = process.env, now = () => Date.now() } = {}) {
  if (!env.IELTS75_SIGNING_SECRET || env.IELTS75_SIGNING_SECRET.length < 32)
    throw Error('IELTS75_SIGNING_SECRET至少32个字符');
  const origins = new Set((env.IELTS75_ALLOWED_ORIGINS || '').split(',').filter(Boolean)),
    rates = new Map();
  function token(user) {
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.uid,
        name: user.username,
        exp: Math.floor(now() / 1000) + 7 * 86400,
      }),
    ).toString('base64url');
    return (
      payload +
      '.' +
      crypto.createHmac('sha256', env.IELTS75_SIGNING_SECRET).update(payload).digest('base64url')
    );
  }
  function auth(req) {
    const t = (req.headers.authorization || '').replace(/^Bearer /, '');
    const [payload, sig, ...extra] = t.split('.');
    if (
      !payload ||
      !sig ||
      extra.length ||
      !equal(
        sig,
        crypto.createHmac('sha256', env.IELTS75_SIGNING_SECRET).update(payload).digest('base64url'),
      )
    )
      throw error(401, '请重新登录');
    let p;
    try {
      p = JSON.parse(Buffer.from(payload, 'base64url'));
    } catch {
      throw error(401, '登录凭据无效');
    }
    if (!p.sub || p.exp <= now() / 1000) throw error(401, '登录已过期，请重新登录');
    return p;
  }
  function rate(req, kind, max) {
    const ip = req.socket.remoteAddress || 'unknown',
      key = kind + ':' + ip,
      minute = Math.floor(now() / 60000);
    const r = rates.get(key) || { minute, n: 0 };
    if (r.minute !== minute) {
      r.minute = minute;
      r.n = 0;
    }
    if (++r.n > max) throw error(429, '请求较多，请稍后重试');
    rates.set(key, r);
    if (rates.size > 5000) for (const [k, v] of rates) if (v.minute < minute) rates.delete(k);
  }
  async function body(req) {
    let size = 0,
      chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 256 * 1024) throw error(413, '同步批次过大');
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      throw error(400, 'JSON格式无效');
    }
  }
  async function update(db, pk, sk, merge) {
    for (let n = 0; n < 10; n++) {
      const old = await db.get(pk, sk),
        next = merge(old?.value);
      if (next === undefined) return old?.value;
      try {
        await db.cas(pk, sk, old?.revision ?? null, next);
        return next;
      } catch (e) {
        if (!(e instanceof Conflict)) throw e;
      }
    }
    throw error(409, '同步冲突，请重试');
  }
  async function session(db, user) {
    const refreshToken = crypto.randomBytes(32).toString('base64url');
    await db.cas('sessions', hash(refreshToken), null, {
      uid: user.uid,
      username: user.username,
      revoked: false,
    });
    return { token: token(user), refreshToken, username: user.username };
  }
  return async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) {
      res.writeHead(403);
      return res.end();
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    try {
      const url = new URL(req.url, 'http://local');
      if (req.method === 'GET' && url.pathname === '/health')
        return send(200, {
          ok: true,
          service: 'wordmemo-sync',
          version: require('./package.json').version,
          favoritesSync: true,
          ratingSync: true,
          booksStored: false,
        });
      const db = typeof store === 'function' ? store(req) : store || aliyunStore(req, env);
      if (req.method === 'POST' && ['/v1/refresh', '/v1/logout'].includes(url.pathname)) {
        rate(req, 'auth', 12);
        const b = await body(req);
        if (typeof b.refreshToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(b.refreshToken))
          throw error(401, '请重新登录');
        const key = hash(b.refreshToken),
          row = await db.get('sessions', key);
        if (!row || row.value.revoked) throw error(401, '请重新登录');
        if (url.pathname === '/v1/logout') {
          await update(db, 'sessions', key, (old) => ({ ...old, revoked: true }));
          return send(200, { ok: true });
        }
        return send(200, { token: token(row.value), username: row.value.username });
      }
      if (req.method === 'POST' && url.pathname === '/v1/session') {
        rate(req, 'auth', 12);
        const p = auth(req);
        return send(200, await session(db, { uid: p.sub, username: p.name }));
      }
      if (req.method === 'POST' && ['/v1/register', '/v1/login'].includes(url.pathname)) {
        rate(req, 'auth', 12);
        const b = await body(req),
          username = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
        if (
          !/^[a-z0-9_.-]{3,40}$/.test(username) ||
          typeof b.password !== 'string' ||
          b.password.length < 10 ||
          b.password.length > 128
        )
          throw error(400, '账号用3–40位英文字母、数字或_.-；密码至少10位');
        const uid = hash(username),
          row = await db.get('auth', 'user:' + uid);
        if (url.pathname === '/v1/register') {
          if (
            !env.IELTS75_REGISTRATION_CODE ||
            !equal(String(b.registrationCode || ''), env.IELTS75_REGISTRATION_CODE)
          )
            throw error(403, '注册邀请码不正确');
          if (row) throw error(409, '账号已存在，请登录');
          // One owner account for this deployment; prevents accidentally creating paid public-user storage.
          await update(db, 'auth', 'owner', (old) => {
            if (old && old.uid !== uid) throw error(403, '本服务只允许已配置的一个账号');
            return old || { uid };
          });
          const salt = crypto.randomBytes(16).toString('hex'),
            passwordHash = (await scrypt(b.password, salt, 64)).toString('hex'),
            user = { uid, username, salt, passwordHash };
          try {
            await db.cas('auth', 'user:' + uid, null, user);
          } catch (e) {
            if (e instanceof Conflict) throw error(409, '账号已存在，请登录');
            throw e;
          }
          return send(201, await session(db, user));
        }
        const salt = row?.value.salt || 'invalid-user-salt',
          passwordHash = (await scrypt(b.password, salt, 64)).toString('hex');
        if (!row || !equal(passwordHash, row.value.passwordHash))
          throw error(401, '账号或密码不正确');
        return send(200, await session(db, row.value));
      }
      const user = auth(req);
      rate(req, 'sync', 120);
      if (req.method === 'GET' && url.pathname === '/v2/capabilities')
        return send(200, { ratingSync: true, algorithms: [algorithm] });
      if (url.pathname.startsWith('/v2/ratings/')) {
        let book;
        try {
          book = decodeURIComponent(url.pathname.slice('/v2/ratings/'.length));
        } catch {
          throw error(400, '书籍标识无效');
        }
        if (!book || book.length > 100) throw error(400, '书籍标识无效');
        const pk = user.sub + ':' + hash(book);
        if (req.method === 'GET') {
          const fingerprint = url.searchParams.get('fingerprint'),
            meta = await db.get(pk, 'meta');
          if (!/^[a-f0-9]{64}$/.test(fingerprint || '')) throw error(400, '词库指纹无效');
          if (meta && meta.value.fingerprint !== fingerprint)
            throw error(409, '设备词库版本不一致，请导入相同词库');
          const cursor = url.searchParams.get('cursor') || '';
          if (cursor && (!cursor.startsWith('rating:') || cursor.length > 350))
            throw error(400, '分页参数无效');
          const page = await db.list(pk, 'rating:', cursor, 500);
          return send(200, {
            records: page.rows.map((row) => row.value),
            next: page.next,
            ratingSync: true,
          });
        }
        if (req.method !== 'POST') throw error(405, '请求方法不支持');
        const batch = await body(req);
        if (
          !/^[a-f0-9]{64}$/.test(batch.fingerprint || '') ||
          !Array.isArray(batch.events) ||
          batch.events.length > 100 ||
          Object.keys(batch).some((key) => !['fingerprint', 'events'].includes(key))
        )
          throw error(400, '评分批次无效，每批最多100条且不接受词书');
        const ids = new Map();
        for (const event of batch.events) {
          try {
            validateRating(event, { bookId: book, now: now() });
          } catch (e) {
            throw error(400, e.message);
          }
          const content = canonicalRating(event);
          if (ids.has(event.eventId) && ids.get(event.eventId) !== content)
            throw error(409, '评分标识冲突');
          ids.set(event.eventId, content);
        }
        await update(db, pk, 'meta', (old) => {
          if (old && old.fingerprint !== batch.fingerprint)
            throw error(409, '设备词库版本不一致，请导入相同词库');
          return old || { fingerprint: batch.fingerprint };
        });
        for (const event of batch.events)
          await update(db, pk, 'rating:' + event.eventId, (old) => {
            if (old && canonicalRating(old) !== canonicalRating(event))
              throw error(409, '评分标识冲突');
            return old ? undefined : event;
          });
        return send(200, { ok: true, accepted: batch.events.length, ratingSync: true });
      }
      const favoriteRoute = url.pathname.startsWith('/v1/favorites/');
      if (!favoriteRoute && !url.pathname.startsWith('/v1/progress/'))
        throw error(404, '接口不存在');
      if (favoriteRoute) {
        const book = decodeURIComponent(url.pathname.slice('/v1/favorites/'.length));
        if (!book || book.length > 100) throw error(400, '书籍标识无效');
        const pk = user.sub + ':' + hash(book);
        if (req.method === 'GET') {
          const meta = await db.get(pk, 'meta');
          if (meta && url.searchParams.get('fingerprint') !== meta.value.fingerprint)
            throw error(409, '设备词库版本不一致，请导入相同词库');
          const cursor = url.searchParams.get('cursor') || '';
          if (cursor && (!cursor.startsWith('favorite:') || cursor.length > 350))
            throw error(400, '分页参数无效');
          const page = await db.list(pk, 'favorite:', cursor, 500);
          return send(200, {
            records: page.rows.map((x) => x.value),
            next: page.next,
            favoritesSync: true,
          });
        }
        if (req.method === 'POST') {
          const b = await body(req);
          if (
            !/^[a-f0-9]{64}$/.test(b.fingerprint || '') ||
            !Array.isArray(b.favorites) ||
            b.favorites.length > 100 ||
            Object.keys(b).some((k) => !['fingerprint', 'favorites'].includes(k))
          )
            throw error(400, '收藏同步批次无效');
          for (const r of b.favorites)
            if (
              !r ||
              !validId(r.id) ||
              typeof r.active !== 'boolean' ||
              !Number.isSafeInteger(r.updatedAt) ||
              r.updatedAt < 1 ||
              r.updatedAt >= 8640000000000000 ||
              !/^[-a-zA-Z0-9]{16,128}$/.test(r.changeId || '') ||
              Object.keys(r).some((k) => !['id', 'active', 'updatedAt', 'changeId'].includes(k))
            )
              throw error(400, '收藏记录格式无效');
          await update(db, pk, 'meta', (old) => {
            if (old && old.fingerprint !== b.fingerprint)
              throw error(409, '设备词库版本不一致，请导入相同词库');
            return old || { fingerprint: b.fingerprint };
          });
          const records = [];
          for (const r of b.favorites)
            records.push(
              await update(db, pk, 'favorite:' + r.id, (old) =>
                !old ||
                r.updatedAt > old.updatedAt ||
                (r.updatedAt === old.updatedAt && r.changeId > old.changeId)
                  ? r
                  : undefined,
              ),
            );
          return send(200, { ok: true, records });
        }
        throw error(405, '请求方法不支持');
      }
      const book = decodeURIComponent(url.pathname.slice('/v1/progress/'.length));
      if (!book || book.length > 100) throw error(400, '书籍标识无效');
      const pk = user.sub + ':' + hash(book);
      if (req.method === 'POST') {
        const b = await body(req);
        if (
          !/^[a-f0-9]{64}$/.test(b.fingerprint || '') ||
          !Array.isArray(b.learned) ||
          !Array.isArray(b.results) ||
          b.learned.length + b.results.length > 100 ||
          Object.keys(b).some((k) => !['fingerprint', 'learned', 'results'].includes(k))
        )
          throw error(400, '仅接受不超过100条学习进度，不接受书籍内容');
        for (const r of [...b.learned, ...b.results])
          if (!r || !validId(r.id) || !validDate(r.date)) throw error(400, '学习条目格式无效');
        for (const r of b.learned)
          if (Object.keys(r).some((k) => !['id', 'date'].includes(k)))
            throw error(400, '只同步词条ID和学习日期');
        for (const r of b.results)
          if (
            !['meaning', 'spelling', 'cloze', 'conversion'].includes(r.mode) ||
            typeof r.correct !== 'boolean' ||
            !/^[-a-zA-Z0-9]{16,128}$/.test(r.eventId || '') ||
            Object.keys(r).some(
              (k) => !['id', 'mode', 'correct', 'date', 'at', 'eventId'].includes(k),
            ) ||
            (r.at !== undefined &&
              (typeof r.at !== 'string' || r.at.length > 40 || !Number.isFinite(Date.parse(r.at))))
          )
            throw error(400, '复习记录格式无效');
        await update(db, pk, 'meta', (old) => {
          if (old && old.fingerprint !== b.fingerprint)
            throw error(409, '设备词库版本不一致，请导入相同词库');
          return old || { fingerprint: b.fingerprint };
        });
        for (const r of b.learned)
          await update(db, pk, 'data:learned:' + r.id, (old) =>
            !old || r.date < old.date ? { id: r.id, date: r.date } : undefined,
          );
        for (const r of b.results)
          await update(db, pk, 'data:result:' + r.eventId, (old) => {
            if (old && JSON.stringify(old) !== JSON.stringify(r))
              throw error(409, '复习记录标识冲突');
            return old ? undefined : r;
          });
        return send(200, { ok: true, accepted: b.learned.length + b.results.length });
      }
      if (req.method === 'GET') {
        const fingerprint = url.searchParams.get('fingerprint'),
          meta = await db.get(pk, 'meta');
        if (meta && fingerprint !== meta.value.fingerprint)
          throw error(409, '设备词库版本不一致，请导入相同词库');
        const cursor = url.searchParams.get('cursor') || '';
        if (cursor && (!cursor.startsWith('data:') || cursor.length > 350))
          throw error(400, '分页参数无效');
        const page = await db.list(pk, 'data:', cursor, 500);
        return send(200, {
          records: page.rows.map((x) => ({
            kind: x.sk.startsWith('data:learned:') ? 'learned' : 'result',
            ...x.value,
          })),
          next: page.next,
        });
      }
      throw error(405, '请求方法不支持');
    } catch (e) {
      send(e.status || 503, {
        error: e.status ? e.message : '云端暂不可用，请保留本地记录稍后重试',
      });
    }
  };
}
if (require.main === module) {
  http.createServer(createApp()).listen(Number(process.env.PORT) || 9000, '0.0.0.0');
}
module.exports = { createApp };
