const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const https = require('firebase-functions/v2/https');

function transpile(file) {
  return ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
}

const vision = {};
new Function('exports', 'require', transpile('garment-vision.ts'))(vision, require);
const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64')}`;

test('valida tipo, contenido y tamaño de la imagen', () => {
  assert.equal(vision.validateImage({ dataUrl: jpeg }), jpeg);
  for (const dataUrl of ['data:image/jpeg;base64,YWJj', 'data:image/gif;base64,R0lGODlh', `${jpeg}!`, `data:image/jpeg;base64,${Buffer.alloc(5 * 1024 * 1024 + 1, 0xff).toString('base64')}`]) {
    assert.throws(() => vision.validateImage({ dataUrl }), { code: 'invalid-argument' });
  }
  assert.throws(() => vision.validateImage({ dataUrl: jpeg, extra: true }), { code: 'invalid-argument' });
});

test('rechaza respuestas del modelo incompletas, inesperadas o con categorías inválidas', () => {
  const valid = { name: 'Camisa', category: 'camisas', color: 'azul' };
  assert.deepEqual(vision.parseSuggestion(JSON.stringify(valid)), valid);
  assert.deepEqual(vision.parseSuggestion('{"name":null,"category":null,"color":null}'), { name: null, category: null, color: null });
  for (const value of ['no json', '{"name":"X"}', JSON.stringify({ ...valid, category: 'falda' }), JSON.stringify({ ...valid, price: 99 })]) {
    assert.throws(() => vision.parseSuggestion(value), { code: 'internal' });
  }
});

test('la callable exige autenticación, limita por separado y envía la imagen al modelo de visión', async () => {
  const calls = [];
  const paths = [];
  const db = {
    doc: (value) => { paths.push(value); return value; },
    runTransaction: async (run) => run({
      get: async () => ({ data: () => ({ requests: [] }) }),
      set: () => {},
    }),
  };
  class GroqMock {
    constructor() {
      this.chat = { completions: { create: async (input) => {
        calls.push(input);
        return { choices: [{ message: { content: '{"name":"Camisa","category":"camisas","color":"azul"}' } }] };
      } } };
    }
  }
  const modules = {
    'firebase-admin/app': { initializeApp: () => {} },
    'firebase-admin/firestore': { getFirestore: () => db, FieldValue: { serverTimestamp: () => 'timestamp' } },
    'firebase-functions/params': { defineSecret: () => ({ value: () => 'test-key' }) },
    'firebase-functions/v2/https': { HttpsError: https.HttpsError, onCall: (options, handler) => ({ options, handler }) },
    'groq-sdk': GroqMock,
    './garment-vision': vision,
  };
  const functions = {};
  new Function('exports', 'require', transpile('index.ts'))(functions, (name) => modules[name] ?? require(name));
  const callable = functions.analyzeGarmentPhoto;
  await assert.rejects(callable.handler({ data: { dataUrl: jpeg } }), { code: 'unauthenticated' });
  await assert.rejects(callable.handler({ auth: { uid: 'user-1' }, data: { dataUrl: 'invalid' } }), { code: 'invalid-argument' });
  assert.deepEqual(paths, []);
  assert.deepEqual(await callable.handler({ auth: { uid: 'user-1' }, data: { dataUrl: jpeg } }), { name: 'Camisa', category: 'camisas', color: 'azul' });
  assert.deepEqual(paths, ['users/user-1/private/garmentVisionUsage']);
  assert.equal(calls[0].model, 'qwen/qwen3.8-27b');
  assert.equal(calls[0].messages[1].content[1].image_url.url, jpeg);
});
