const { test } = require('node:test');
const assert = require('node:assert/strict');

test('patched protobuf runtime roundtrips Tablestore generated request messages', () => {
  const proto = require('tablestore/lib/protocol/tablestore_compiled_proto.js').main.proto;
  const version = require('protobufjs/package.json').version;
  assert.equal(version, '7.6.6');
  const input = {
    tableName: 'fixture_table',
    primaryKey: Buffer.from([1, 2, 3]),
    maxVersions: 1,
    columnsToGet: ['payload', 'revision'],
  };
  assert.equal(proto.GetRowRequest.verify(input), null);
  const encoded = proto.GetRowRequest.encode(proto.GetRowRequest.create(input)).finish();
  const decoded = proto.GetRowRequest.decode(encoded);
  assert.equal(decoded.tableName, input.tableName);
  assert.deepEqual(Buffer.from(decoded.primaryKey), input.primaryKey);
  assert.deepEqual(decoded.columnsToGet, input.columnsToGet);
  assert.equal(decoded.maxVersions, 1);
  const Tablestore = require('tablestore');
  const client = new Tablestore.Client({
    accessKeyId: 'fixture',
    secretAccessKey: 'fixture',
    endpoint: 'https://fixture.cn-shenzhen.ots.aliyuncs.com',
    instancename: 'fixture',
    maxRetries: 0,
  });
  assert.equal(typeof client.getRow, 'function');
  assert.equal(Tablestore.Long.fromNumber(42).toString(), '42');
});
