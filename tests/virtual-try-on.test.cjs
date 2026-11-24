const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function setup() {
  const calls = [];
  const deletes = [];
  const auth = { currentUser: { uid: 'alice' } };
  const modules = {
    '../firebase/client': { auth, firebaseApp: {} },
    'firebase/functions': {
      getFunctions: () => ({}),
      httpsCallable: (_functions, name) => async (data) => { calls.push({ name, data }); return { data: {} }; },
    },
    'firebase/storage': {
      getStorage: () => ({}),
      ref: (_storage, filePath) => filePath,
      getBlob: async (filePath) => { throw Object.assign(new Error(filePath), { code: 'storage/object-not-found' }); },
      deleteObject: async (filePath) => { deletes.push(filePath); },
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'virtualTryOn.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const service = {};
  new Function('exports', 'require', code)(service, (name) => modules[name] ?? require(name));
  return { service, calls, deletes, auth };
}

test('solo envía una petición explícita y rechaza sesiones ajenas', async () => {
  const { service, calls, auth } = setup();
  assert.equal(calls.length, 0);
  await assert.rejects(service.generateVirtualImage('bob', 'item'), /Inicia sesión/);
  await service.generateVirtualImage('alice', 'item');
  assert.deepEqual(calls, [{ name: 'generateVirtualTryOn', data: { garmentId: 'item', consent: true } }]);
  auth.currentUser = null;
  await assert.rejects(service.generateVirtualImage('alice', 'item'), /Inicia sesión/);
  assert.equal(calls.length, 1);
});

test('valida la foto antes de subirla y utiliza rutas privadas para leer y borrar', async () => {
  const { service, calls, deletes } = setup();
  await assert.rejects(service.saveVirtualPhoto('alice', { type: 'image/gif', size: 10 }), /JPG, PNG o WebP/);
  await assert.rejects(service.saveVirtualPhoto('alice', { type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }), /5 MB/);
  assert.equal(calls.length, 0);
  assert.equal(await service.readVirtualImage('alice', 'photo'), null);
  await service.deleteVirtualImage('alice', 'result');
  assert.deepEqual(deletes, ['users/alice/virtualTryOn/result']);
});
