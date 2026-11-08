'use strict';
class Conflict extends Error {}
class MemoryStore {
  constructor() {
    this.rows = new Map();
  }
  key(pk, sk) {
    return pk + '\0' + sk;
  }
  async get(pk, sk) {
    return structuredClone(this.rows.get(this.key(pk, sk)) || null);
  }
  async cas(pk, sk, expected, value) {
    const key = this.key(pk, sk),
      old = this.rows.get(key);
    if ((old?.revision ?? null) !== expected) throw new Conflict();
    const row = { value: structuredClone(value), revision: (expected || 0) + 1 };
    this.rows.set(key, row);
    return row;
  }
  async list(pk, prefix, cursor = '', limit = 500) {
    const rows = [...this.rows.entries()]
      .filter(([key]) => key.startsWith(pk + '\0' + prefix))
      .map(([key, row]) => ({ sk: key.slice(pk.length + 1), ...structuredClone(row) }))
      .filter((x) => x.sk > cursor)
      .sort((a, b) => a.sk.localeCompare(b.sk));
    return { rows: rows.slice(0, limit), next: rows.length > limit ? rows[limit - 1].sk : null };
  }
}
function aliyunStore(request, env = process.env) {
  const T = require('tablestore');
  const accessKeyId = request.headers['x-fc-access-key-id'] || env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    secretAccessKey =
      request.headers['x-fc-access-key-secret'] || env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    stsToken = request.headers['x-fc-security-token'] || env.ALIBABA_CLOUD_SECURITY_TOKEN;
  if (!accessKeyId || !secretAccessKey || !stsToken) throw Error('请配置FC函数访问角色');
  const client = new T.Client({
      accessKeyId,
      secretAccessKey,
      stsToken,
      endpoint: env.IELTS75_TABLESTORE_ENDPOINT,
      instancename: env.IELTS75_TABLESTORE_INSTANCE,
      maxRetries: 2,
    }),
    tableName = env.IELTS75_TABLE || 'ielts75_sync';
  const call = (name, args) =>
    new Promise((ok, fail) =>
      client[name](args, (e, d) =>
        e ? fail(e.code === 'OTSConditionCheckFail' ? new Conflict() : e) : ok(d),
      ),
    );
  const parse = (row) => {
    const p = row?.attributes?.find((x) => x.columnName === 'payload');
    return p
      ? {
          value: JSON.parse(p.columnValue),
          revision: Number(
            row.attributes.find((x) => x.columnName === 'revision').columnValue.toString(),
          ),
        }
      : null;
  };
  return {
    async get(pk, sk) {
      return parse(
        (
          await call('getRow', {
            tableName,
            primaryKey: [{ pk }, { sk }],
            maxVersions: 1,
            columnsToGet: ['payload', 'revision'],
          })
        ).row,
      );
    },
    async cas(pk, sk, expected, value) {
      const revision = (expected || 0) + 1;
      const condition = new T.Condition(
        expected === null
          ? T.RowExistenceExpectation.EXPECT_NOT_EXIST
          : T.RowExistenceExpectation.EXPECT_EXIST,
        expected === null
          ? null
          : new T.SingleColumnCondition(
              'revision',
              T.Long.fromNumber(expected),
              T.ComparatorType.EQUAL,
              false,
              true,
            ),
      );
      await call('putRow', {
        tableName,
        primaryKey: [{ pk }, { sk }],
        condition,
        attributeColumns: [
          { payload: JSON.stringify(value) },
          { revision: T.Long.fromNumber(revision) },
        ],
      });
      return { value, revision };
    },
    async list(pk, prefix, cursor = '', limit = 500) {
      const start = cursor ? cursor + '\0' : prefix;
      const d = await call('getRange', {
        tableName,
        direction: T.Direction.FORWARD,
        maxVersions: 1,
        columnsToGet: ['payload', 'revision'],
        inclusiveStartPrimaryKey: [{ pk }, { sk: start }],
        exclusiveEndPrimaryKey: [{ pk }, { sk: prefix + '\uffff' }],
        limit,
      });
      const rows = d.rows.map((row) => ({
        sk: row.primaryKey.find((x) => x.name === 'sk').value,
        ...parse(row),
      }));
      return { rows, next: d.nextStartPrimaryKey?.length && rows.length ? rows.at(-1).sk : null };
    },
  };
}
module.exports = { Conflict, MemoryStore, aliyunStore };
