const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const ts = require('typescript');

process.env.GCLOUD_PROJECT = 'demo-miarmario';

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const functions = {};
new Function('exports', 'require', code)(functions, require);

test('recommendOutfit responde al preflight sin desactivar la autenticación', async () => {
  assert.deepEqual(functions.recommendOutfit.__endpoint.region, ['us-central1']);
  const app = express();
  app.use(express.json(), functions.recommendOutfit);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const url = `http://127.0.0.1:${server.address().port}/recommendOutfit`;
  const requestedHeaders = 'authorization,content-type,firebase-instance-id-token,x-firebase-appcheck';

  try {
    for (const origin of ['https://fsmdasanlo.github.io', 'http://localhost:5173']) {
      const response = await fetch(url, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': requestedHeaders,
        },
      });
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.equal(response.headers.get('access-control-allow-methods'), 'POST');
      assert.equal(response.headers.get('access-control-allow-headers'), requestedHeaders);
    }

    for (const origin of ['https://fsmdasanlo.github.io.evil.example', 'http://localhost:5174']) {
      const response = await fetch(url, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
      });
      assert.equal(response.headers.get('access-control-allow-origin'), null);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { Origin: 'https://fsmdasanlo.github.io', 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { question: 'Prueba' } }),
    });
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://fsmdasanlo.github.io');
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.status, 'UNAUTHENTICATED');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
