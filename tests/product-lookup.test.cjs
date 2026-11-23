const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'productLookup.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const service = {};
new Function('exports', code)(service);

test('acepta EAN y QR GS1 válidos, pero no abre enlaces arbitrarios ni códigos incorrectos', () => {
  assert.equal(service.productCode('8719692889214'), '8719692889214');
  assert.equal(service.productCode('https://example.com/01/08719692889214'), '08719692889214');
  assert.equal(service.productCode('https://example.com/product/8719692889214'), null);
  assert.equal(service.productCode('8719692889215'), null);
  assert.equal(service.productCode('hola'), null);
});

test('consulta únicamente el catálogo y devuelve datos disponibles', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(url, /^https:\/\/world\.openproductsfacts\.org\/api\/v3\/product\/8719692889214\?/);
    assert.match(options.headers['X-User-Agent'], /^MiArmario/);
    return new Response(JSON.stringify({ status: 'success', product: { product_name_es: ' Camiseta ', brands: ' Marca ' } }), { status: 200 });
  });
  assert.deepEqual(await service.lookupProduct('8719692889214'), { name: 'Camiseta', brand: 'Marca' });
});

test('distingue producto inexistente de errores o respuestas inválidas', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  assert.equal(await service.lookupProduct('8719692889214'), null);
  fetchMock.mock.mockImplementation(async () => new Response('', { status: 503 }));
  await assert.rejects(service.lookupProduct('8719692889214'), /No se pudo consultar/);
  fetchMock.mock.mockImplementation(async () => new Response('{}', { status: 200 }));
  await assert.rejects(service.lookupProduct('8719692889214'), /respuesta no válida/);
  await assert.rejects(service.lookupProduct('https://example.com/'), /no es un EAN/);
  assert.equal(fetchMock.mock.callCount(), 3);
});
