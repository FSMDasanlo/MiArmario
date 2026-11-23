const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadService() {
  const writes = [];
  const uploads = [];
  const firestore = {
    getFirestore: () => ({}),
    collection: () => ({}),
    doc: (_collection, id) => ({ id: id ?? 'new-garment' }),
    serverTimestamp: () => 'timestamp',
    setDoc: async (ref, data) => writes.push({ ref, data }),
  };
  const storage = {
    getStorage: () => ({}),
    ref: (_storage, imagePath) => imagePath,
    uploadBytes: async (ref, photo) => uploads.push({ ref, photo }),
  };
  const modules = {
    '../firebase/client': { firebaseApp: {} },
    'firebase/firestore/lite': firestore,
    'firebase/storage': storage,
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'garments.ts'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  const requireMock = (name) => {
    if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
    return modules[name];
  };
  new Function('exports', 'require', code)(exports, requireMock);
  return { saveGarment: exports.saveGarment, writes, uploads };
}

const garment = {
  name: 'Camiseta',
  category: 'camisetas',
  color: 'azul',
  price: 25.5,
  season: ['verano'],
  style: ['casual'],
};

test('guarda una prenda con foto usando el mismo identificador', async () => {
  const { saveGarment, writes, uploads } = loadService();
  await saveGarment('user-1', garment, undefined, { type: 'image/png', size: 10 });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].ref.id, 'new-garment');
  assert.equal(writes[0].data.imagePath, 'users/user-1/garments/new-garment/photo');
  assert.equal(uploads[0].ref, writes[0].data.imagePath);
  assert.equal(writes[0].data.price, 25.5);
});

test('guarda una prenda sin foto y admite precio cero', async () => {
  const { saveGarment, writes, uploads } = loadService();
  await saveGarment('user-1', { ...garment, price: 0 });
  assert.equal(writes[0].data.price, 0);
  assert.equal('imagePath' in writes[0].data, false);
  assert.equal(uploads.length, 0);
});
