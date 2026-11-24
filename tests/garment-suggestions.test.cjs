const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function setup() {
  const slots = [];
  let cursor = 0;
  let resolveSuggestion;
  const suggestion = new Promise((resolve) => { resolveSuggestion = resolve; });
  const element = (type, props) => ({ type, props: props ?? {} });
  const modules = {
    react: {
      useState: (initial) => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
      },
      useRef: (initial) => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = { current: initial };
        return slots[index];
      },
      useEffect: () => {},
    },
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'fragment' },
    'lucide-react': {},
    '../services/garmentVision': { analyzeGarmentPhoto: () => suggestion },
    '../services/productLookup': {},
    './BarcodeScanner': {},
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'GarmentForm.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'window', code)(exports, (name) => modules[name] ?? require(name), { confirm: () => true });
  function render() {
    cursor = 0;
    return exports.GarmentForm({ onClose() {}, onSave: async () => {} });
  }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return undefined;
  }
  return { render, find, resolveSuggestion };
}

test('resalta las sugerencias aplicadas y respeta los datos editados durante el análisis', async () => {
  const { render, find, resolveSuggestion } = setup();
  let tree = render();
  const fileInput = find(tree, (node) => node.type === 'input' && node.props.type === 'file');
  fileInput.props.onChange({ target: { files: [{ type: 'image/png', size: 10 }], value: 'foto.png' } });

  tree = render();
  find(tree, (node) => node.type === 'input' && node.props.placeholder === 'Ej. Camiseta de lino')
    .props.onChange({ target: { value: 'Mi nombre' } });
  resolveSuggestion({ name: 'Sugerencia', color: 'Azul', category: 'vestidos' });
  await new Promise((resolve) => setImmediate(resolve));

  tree = render();
  const name = find(tree, (node) => node.type === 'input' && node.props.placeholder === 'Ej. Camiseta de lino');
  const color = find(tree, (node) => node.type === 'input' && node.props.placeholder === 'Ej. Azul marino');
  const brand = find(tree, (node) => node.type === 'input' && node.props.placeholder === '¿De dónde viene?');
  const category = find(tree, (node) => node.type === 'select');
  assert.equal(name.props.value, 'Mi nombre');
  assert.equal(name.props.className, '');
  assert.equal(color.props.value, 'Azul');
  assert.equal(color.props.className, 'field-suggested');
  assert.equal(brand.props.className, 'field-suggested');
  assert.equal(category.props.value, 'vestidos');
  assert.equal(category.props.className, 'field-suggested');

  color.props.onChange({ target: { value: 'Verde' } });
  tree = render();
  assert.equal(find(tree, (node) => node.type === 'input' && node.props.placeholder === 'Ej. Azul marino').props.className, '');
});
