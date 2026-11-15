import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../src/components/LedgerColorPicker.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('colors.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const normalize = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'normalizeHex');
const context = vm.createContext({});
vm.runInContext(ts.transpile(normalize.getText(ast).replace('export ', ''), { target: ts.ScriptTarget.ES2022 }), context);
for (const [input, expected] of [['#ABC','#aabbcc'],['14B8A6','#14b8a6'],[' #123456 ','#123456'],['#000','#000000'],['#12',null],['red',null],['#12345g',null],['',null]]) {
  assert.equal(context.normalizeHex(input), expected);
}
const colors = source.match(/#[a-f\d]{6}/gi).filter(color => !['#ffffff','#f8fafc','#334155','#14b8a6'].includes(color.toLowerCase()));
assert.ok(new Set(colors).size >= 50, 'Keep a broad modern palette');
assert.doesNotMatch(source, /type="color"/, 'Custom controls must not depend on the native phone picker');
console.log('Ledger color validation and palette checks passed.');
