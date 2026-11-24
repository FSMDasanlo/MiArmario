const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { HttpsError } = require('firebase-functions/v2/https');

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function setup() {
  const files = new Map([
    ['users/alice/virtualTryOn/photo', { bytes: jpeg, mimeType: 'image/jpeg' }],
    ['users/alice/garments/item-1/photo', { bytes: png, mimeType: 'image/png' }],
  ]);
  const garment = { exists: true, imagePath: 'users/alice/garments/item-1/photo' };
  const calls = [];
  const saves = [];
  let lock;
  let output = [{ inlineData: { mimeType: 'image/png', data: png.toString('base64') } }];
  const db = {
    doc: (path) => ({
      path,
      get: async () => ({ exists: garment.exists, data: () => ({ imagePath: garment.imagePath }) }),
    }),
    runTransaction: async (run) => run({
      get: async () => ({ data: () => lock }),
      set: (_ref, value) => { lock = value; },
      delete: () => { lock = undefined; },
    }),
  };
  const bucket = {
    file: (filePath) => ({
      getMetadata: async () => {
        const file = files.get(filePath);
        if (!file) throw new Error('not found');
        return [{ contentType: file.mimeType, size: file.bytes.length }];
      },
      download: async () => [files.get(filePath).bytes],
      save: async (bytes, options) => { saves.push({ filePath, bytes, options }); },
    }),
  };
  class GoogleGenAI {
    constructor(options) {
      this.models = { generateContent: async (input) => {
        calls.push({ options, input });
        return { candidates: [{ content: { parts: output } }] };
      } };
    }
  }
  const modules = {
    '@google/genai': { GoogleGenAI },
    'firebase-admin/firestore': { getFirestore: () => db },
    'firebase-admin/storage': { getStorage: () => ({ bucket: () => bucket }) },
    'firebase-functions/params': { projectID: { value: () => 'demo-miarmario' } },
    'firebase-functions/v2/https': { HttpsError, onCall: (options, handler) => ({ options, handler }) },
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'virtual-try-on.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const functions = {};
  new Function('exports', 'require', code)(functions, (name) => modules[name] ?? require(name));
  return { functions, garment, files, saves, calls, setOutput: (parts) => { output = parts; } };
}

test('exige autenticación y consentimiento y rechaza rutas ajenas antes de llamar a la IA', async () => {
  const { functions, garment, calls } = setup();
  const generate = functions.generateVirtualTryOn.handler;
  await assert.rejects(generate({ data: { garmentId: 'item-1', consent: true } }), { code: 'unauthenticated' });
  await assert.rejects(generate({ auth: { uid: 'alice' }, data: { garmentId: 'item-1', consent: false } }), { code: 'invalid-argument' });
  await assert.rejects(generate({ auth: { uid: 'alice' }, data: { garmentId: '../bob', consent: true } }), { code: 'invalid-argument' });
  garment.imagePath = 'users/bob/garments/item-1/photo';
  await assert.rejects(generate({ auth: { uid: 'alice' }, data: { garmentId: 'item-1', consent: true } }), { code: 'failed-precondition' });
  garment.exists = false;
  await assert.rejects(generate({ auth: { uid: 'alice' }, data: { garmentId: 'item-1', consent: true } }), { code: 'failed-precondition' });
  assert.equal(calls.length, 0);
});

test('valida y guarda la fotografía privada sin token de descarga', async () => {
  const { functions, saves } = setup();
  const save = functions.saveVirtualTryOnPhoto.handler;
  await assert.rejects(save({ data: {} }), { code: 'unauthenticated' });
  for (const data of [
    { mimeType: 'image/png', data: jpeg.toString('base64') },
    { mimeType: 'image/gif', data: jpeg.toString('base64') },
    { mimeType: 'image/jpeg', data: `${jpeg.toString('base64')}!` },
    { mimeType: 'image/jpeg', data: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') },
  ]) await assert.rejects(save({ auth: { uid: 'alice' }, data }), { code: 'invalid-argument' });
  await save({ auth: { uid: 'alice' }, data: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } });
  assert.equal(saves[0].filePath, 'users/alice/virtualTryOn/photo');
  assert.deepEqual(saves[0].options.metadata, { contentType: 'image/jpeg', cacheControl: 'private, no-store' });
});

test('usa una petición simulada sin reintentos y solo guarda una respuesta válida', async () => {
  const { functions, calls, saves, setOutput, files } = setup();
  const request = { auth: { uid: 'alice' }, data: { garmentId: 'item-1', consent: true } };
  setOutput([]);
  await assert.rejects(functions.generateVirtualTryOn.handler(request), { code: 'internal' });
  setOutput([{ inlineData: { mimeType: 'image/png', data: png.toString('base64') } }, { inlineData: { mimeType: 'image/png', data: png.toString('base64') } }]);
  await assert.rejects(functions.generateVirtualTryOn.handler(request), { code: 'internal' });
  assert.equal(saves.length, 0);
  setOutput([{ inlineData: { mimeType: 'image/png', data: png.toString('base64') } }]);
  await functions.generateVirtualTryOn.handler(request);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].options.location, 'global');
  assert.equal(calls[2].options.httpOptions.retryOptions.attempts, 1);
  assert.equal(calls[2].input.model, 'gemini-nano-banana-2.1');
  assert.equal(calls[2].input.contents[0].parts[1].inlineData.data, jpeg.toString('base64'));
  assert.equal(calls[2].input.contents[0].parts[2].inlineData.data, png.toString('base64'));
  assert.deepEqual(calls[2].input.config, { candidateCount: 1, responseModalities: ['IMAGE'], imageConfig: { imageSize: '1K', aspectRatio: '3:4' } });
  assert.equal(saves[0].filePath, 'users/alice/virtualTryOn/result');
  files.set('users/alice/virtualTryOn/photo', { bytes: Buffer.from('not an image'), mimeType: 'image/jpeg' });
  await assert.rejects(functions.generateVirtualTryOn.handler(request), { code: 'failed-precondition' });
  assert.equal(calls.length, 3);
});
