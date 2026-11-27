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
    ['users/alice/virtualTryOn/face', { bytes: jpeg, mimeType: 'image/jpeg' }],
    ['users/alice/virtualTryOn/mannequin', { bytes: png, mimeType: 'image/png' }],
    ['users/alice/garments/item-1/photo', { bytes: png, mimeType: 'image/png' }],
    ['users/alice/garments/item-2/photo', { bytes: jpeg, mimeType: 'image/jpeg' }],
  ]);
  const garment = { exists: true, imagePath: 'users/alice/garments/item-1/photo' };
  const secondGarment = { exists: true, imagePath: 'users/alice/garments/item-2/photo' };
  const calls = [];
  const saves = [];
  let lock;
  let output = [{ inlineData: { mimeType: 'image/png', data: png.toString('base64') } }];
  const db = {
    doc: (path) => ({
      path,
      get: async () => {
        const item = path.endsWith('/item-2') ? secondGarment : garment;
        return { exists: item.exists, data: () => ({ imagePath: item.imagePath }) };
      },
    }),
    runTransaction: async (run) => run({
      get: async () => ({ data: () => lock }),
      set: (_ref, value) => { lock = value; },
      delete: () => { lock = undefined; },
    }),
    collection: () => ({ doc: () => ({ set: async () => {} }) }),
  };
  const bucket = {
    file: (filePath) => ({
      getMetadata: async () => {
        const file = files.get(filePath);
        if (!file) {
          const error = new Error('not found');
          error.code = 404;
          throw error;
        }
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
    'firebase-admin/firestore': { FieldValue: { increment: (value) => ({ increment: value }) }, getFirestore: () => db },
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

test('valida y guarda fotografías privadas sin token de descarga', async () => {
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
  await save({ auth: { uid: 'alice' }, data: { mimeType: 'image/png', data: png.toString('base64'), kind: 'face' } });
  assert.equal(saves[1].filePath, 'users/alice/virtualTryOn/face');
});

test('mantiene una única petición simulada para el flujo clásico', async () => {
  const { functions, calls, saves, setOutput, files } = setup();
  const request = { auth: { uid: 'alice', token: {} }, data: { garmentId: 'item-1', consent: true } };
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
  assert.match(calls[2].input.contents[0].parts[0].text, /primera imagen muestra a la persona/);
  assert.deepEqual(calls[2].input.config, { candidateCount: 1, responseModalities: ['IMAGE'], imageConfig: { imageSize: '1K', aspectRatio: '3:4' } });
  assert.equal(saves[0].filePath, 'users/alice/virtualTryOn/result');
  files.set('users/alice/virtualTryOn/photo', { bytes: Buffer.from('not an image'), mimeType: 'image/jpeg' });
  await assert.rejects(functions.generateVirtualTryOn.handler(request), { code: 'failed-precondition' });
  assert.equal(calls.length, 3);
});

test('incluye la referencia y todas las prendas seleccionadas con el prompt de cada modalidad', async () => {
  const { functions, calls } = setup();
  const generate = functions.generateVirtualTryOn.handler;
  for (const [mode, garmentIds, expectedImages, prompt] of [
    ['body', ['item-1', 'item-2'], [jpeg, png, jpeg], /primera imagen muestra a la persona/],
    ['face', ['item-1'], [jpeg, png], /identidad facial/],
    ['face', ['item-1', 'item-2'], [jpeg, png, jpeg], /identidad facial/],
    ['mannequin', ['item-1'], [png, png], /mismo maniquí/],
    ['mannequin-face', ['item-1'], [jpeg, png, png], /maniquí corporal/],
    ['generated', ['item-1', 'item-2'], [png, jpeg], /modelo humano adulto/],
  ]) {
    await generate({ auth: { uid: 'alice', token: {} }, data: { mode, garmentIds, consent: true } });
    const parts = calls.at(-1).input.contents[0].parts;
    assert.match(parts[0].text, prompt);
    assert.deepEqual(parts.filter((part) => part.inlineData).map((part) => Buffer.from(part.inlineData.data, 'base64')), expectedImages);
    assert.match(parts.at(-1).text, /una sola fotografía/);
  }
  assert.equal(calls.length, 6);
});

test('prioriza las facciones de la foto en las modalidades con referencia facial', async () => {
  const { functions, calls } = setup();
  for (const mode of ['face', 'mannequin-face']) {
    await functions.generateVirtualTryOn.handler({
      auth: { uid: 'alice', token: {} }, data: { mode, garmentIds: ['item-1'], consent: true },
    });
    const parts = calls.at(-1).input.contents[0].parts;
    assert.match(parts[0].text, /identidad de la persona de la primera imagen es prioritaria/);
    assert.match(parts[0].text, /ojos, cejas, nariz, labios, mandíbula/);
    assert.match(parts[0].text, /No embellezcas, rejuvenezcas, estilices/);
    assert.equal(parts[2].inlineData.data, jpeg.toString('base64'));
  }
  assert.equal(calls.length, 2);
});

test('rechaza modalidades con referencias ausentes y selecciones inválidas antes de generar', async () => {
  const { functions, files, calls } = setup();
  const generate = functions.generateVirtualTryOn.handler;
  files.delete('users/alice/virtualTryOn/face');
  await assert.rejects(generate({ auth: { uid: 'alice', token: {} }, data: { mode: 'face', garmentIds: ['item-1'], consent: true } }), { code: 'failed-precondition' });
  for (const garmentIds of [[], ['item-1', 'item-1'], Array(7).fill('item-1')]) {
    await assert.rejects(generate({ auth: { uid: 'alice', token: {} }, data: { mode: 'generated', garmentIds, consent: true } }), { code: 'invalid-argument' });
  }
  assert.equal(calls.length, 0);
});
