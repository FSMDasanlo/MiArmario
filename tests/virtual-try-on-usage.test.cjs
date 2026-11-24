const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { createRequire } = require('node:module');

function setup({ records = [], failWrite = false, failImage = false } = {}) {
  const writes = [];
  const queries = [];
  let aiCalls = 0;
  let writesAtCall = 0;
  const firestore = {
    doc: (path) => ({
      path,
      get: async () => ({ exists: true, data: () => ({ imagePath: 'users/alice/garments/item/photo' }) }),
    }),
    runTransaction: async (action) => action({
      get: async () => ({ data: () => ({}) }),
      set: () => {},
      delete: () => {},
    }),
    collection: () => ({
      doc: (path) => ({
        set: async (data) => {
          if (failWrite) throw new Error('write failed');
          writes.push({ path, data });
        },
      }),
      where: function (field, operator, value) {
        queries.push({ field, operator, value });
        return this;
      },
      get: async () => ({
        docs: records
          .filter((record) => record.day >= queries[0].value && record.day <= queries[1].value)
          .map((record) => ({ data: () => record })),
      }),
    }),
  };
  class HttpsError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const modules = {
    'firebase-admin/firestore': { getFirestore: () => firestore, FieldValue: { increment: (n) => n } },
    'firebase-admin/storage': { getStorage: () => ({ bucket: () => ({ file: () => ({
      getMetadata: async () => {
        if (failImage) throw Object.assign(new Error('missing'), { code: 404 });
        return [{ contentType: 'image/png', size: png.length }];
      },
      download: async () => [png],
    }) }) }) },
    'firebase-functions/params': { projectID: { value: () => 'project' } },
    'firebase-functions/v2/https': { HttpsError, onCall: (_options, handler) => handler },
    '@google/genai': { GoogleGenAI: class {
      models = { generateContent: async () => { aiCalls++; writesAtCall = writes.length; throw new Error('provider failed'); } };
    } },
  };
  const functionsRequire = createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
  const source = fs.readFileSync(path.join(__dirname, '..', 'functions', 'src', 'virtual-try-on.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const service = {};
  new Function('exports', 'require', code)(service, (name) => modules[name] ?? functionsRequire(name));
  return { service, writes, queries, aiCalls: () => aiCalls, writesAtCall: () => writesAtCall };
}

const admin = { uid: 'admin', token: { email: 'jesus.samperruiz@gmail.com', email_verified: true } };

test('solo el administrador verificado puede consultar y las fechas se filtran de forma inclusiva', async () => {
  const { service, queries } = setup({ records: [
    { day: '2026-11-01', uid: 'a', email: 'a@example.com', count: 2 },
    { day: '2026-11-30', uid: 'a', email: 'a@example.com', count: 3 },
    { day: '2026-11-15', uid: 'b', email: null, count: 1 },
    { day: '2026-12-01', uid: 'b', email: null, count: 9 },
  ] });
  const data = { from: '2026-11-01', to: '2026-11-30' };
  await assert.rejects(service.getVirtualTryOnUsage({ data }), { code: 'unauthenticated' });
  await assert.rejects(service.getVirtualTryOnUsage({ auth: { ...admin, token: { ...admin.token, email_verified: false } }, data }), { code: 'permission-denied' });
  await assert.rejects(service.getVirtualTryOnUsage({ auth: { uid: 'other', token: { email: 'other@example.com', email_verified: true } }, data }), { code: 'permission-denied' });
  await assert.rejects(service.getVirtualTryOnUsage({ auth: admin, data: { from: '2026-12-01', to: '2026-11-01' } }), { code: 'invalid-argument' });
  await assert.rejects(service.getVirtualTryOnUsage({ auth: admin, data: { from: '2026-02-30', to: '2026-03-01' } }), { code: 'invalid-argument' });
  const report = await service.getVirtualTryOnUsage({ auth: admin, data });
  assert.equal(queries.length, 2);
  assert.deepEqual(report, { users: [
    { uid: 'a', email: 'a@example.com', count: 5 },
    { uid: 'b', email: null, count: 1 },
  ], total: 6 });
});

test('registra el intento antes de llamar a la IA, incluso si falla', async () => {
  const { service, writes, aiCalls, writesAtCall } = setup();
  await assert.rejects(service.generateVirtualTryOn({
    auth: { uid: 'alice', token: { email: 'alice@example.com' } },
    data: { garmentId: 'item', consent: true },
  }), { code: 'unavailable' });
  assert.equal(aiCalls(), 1);
  assert.equal(writesAtCall(), 1);
  assert.equal(writes.length, 1);
  assert.match(writes[0].data.day, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual({ uid: writes[0].data.uid, email: writes[0].data.email, count: writes[0].data.count }, {
    uid: 'alice', email: 'alice@example.com', count: 1,
  });
});

test('no llama a la IA si no puede registrar el intento o falta una imagen', async () => {
  for (const options of [{ failWrite: true }, { failImage: true }]) {
    const { service, writes, aiCalls } = setup(options);
    await assert.rejects(service.generateVirtualTryOn({
      auth: { uid: 'alice', token: {} }, data: { garmentId: 'item', consent: true },
    }));
    assert.equal(aiCalls(), 0);
    assert.equal(writes.length, 0);
  }
});
