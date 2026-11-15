// Exercise the component's actual handlers without Firebase or persistent writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
const source = readFileSync(new URL('../src/components/VerticalLedgerSheet.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('ledger.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations.set(node.name.text, node.initializer.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const handlers = ['actionRowIds', 'insertAtSelectedRows', 'moveSelectedRows', 'applyLedgerRowFormat', 'handleSelectBgColor', 'handleInsertRowAbove', 'handleInsertRowBelow', 'handleMoveRowUp', 'handleMoveRowDown', 'handleDeleteRow', 'handleClearAllItems', 'openLedgerProductCart', 'handleInsertSeparator'];
function fixture(selected = ['b', 'd']) {
  const state = {
    items: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, details: id, quantity: 1, total: 10, pageNumber: 1 })),
    selectedRowIds: selected, selectedRowId: 'a', rowSelectionMode: true, sheetMode: 'edit',
    hasExplicitRowSelection: true, crypto: webcrypto, logs: [], alerts: [], currentPage: 1,
    invoice: { id: 'invoice' }, customer: { id: 'customer' }, settings: { currency: 'IQD' },
    window: { confirm: () => true },
    getCurrentDateFormatted: () => '2026-11-15', getCurrentTimeFormatted: () => '8:00', getArabicDayName: () => 'الأحد',
    setItems: fn => { state.items = typeof fn === 'function' ? fn(state.items) : fn; },
    persistChanges: value => { state.items = value; },
    setSelectedRowIds: fn => { state.selectedRowIds = fn(state.selectedRowIds); },
    setSelectedRowId: id => { state.selectedRowId = id; },
    setHasUnsavedChanges: () => {}, setSaveStatus: () => {}, setSheetBgColor: () => { throw Error('global background changed'); },
    onAddChangeLog: entry => state.logs.push(entry), formatDebtChangeLogDetails: name => name,
    alert: message => state.alerts.push(message), isEmptyCartRow: row => row && !row.details,
    onOpenProductCart: id => { state.cartTarget = id; },
  };
  const code = handlers.map(name => `var ${name} = ${declarations.get(name)};`).join('\n');
  vm.runInContext(ts.transpile(code, { target: ts.ScriptTarget.ES2022 }), vm.createContext(state));
  return state;
}
const ids = state => Array.from(state.items, row => row.id);
let state = fixture();
state.applyLedgerRowFormat({ rowFontSize: 20 });
assert.deepEqual(state.items.filter(row => row.rowFontSize).map(row => row.id), ['b', 'd']);
state.handleSelectBgColor('#abcdef');
assert.deepEqual(state.items.filter(row => row.rowBackgroundColor).map(row => row.id), ['b', 'd']);
state = fixture([]);
state.applyLedgerRowFormat({ rowFontBold: true });
state.handleInsertSeparator(); state.handleDeleteRow(); state.handleInsertRowAbove(); state.handleMoveRowDown(); state.handleClearAllItems();
assert.deepEqual(ids(state), ['a', 'b', 'c', 'd', 'e']);
assert.ok(state.items.every(row => row.rowFontBold === undefined));
state = fixture(); state.handleDeleteRow();
assert.deepEqual(ids(state), ['a', 'c', 'e']);
assert.deepEqual(state.logs.map(log => log.targetItemId), ['b', 'd']);
state = fixture(); state.handleClearAllItems(); assert.deepEqual(ids(state), ['a', 'c', 'e']);
state = fixture(['b', 'c']); state.handleMoveRowUp(); assert.deepEqual(ids(state), ['b', 'c', 'a', 'd', 'e']);
state = fixture(['b', 'c']); state.handleMoveRowDown(); assert.deepEqual(ids(state), ['a', 'd', 'b', 'c', 'e']);
state = fixture(['a', 'b']); state.handleMoveRowUp(); assert.deepEqual(ids(state), ['a', 'b', 'c', 'd', 'e']);
for (const below of [false, true]) {
  state = fixture(); state[below ? 'handleInsertRowBelow' : 'handleInsertRowAbove']();
  assert.equal(state.items.length, 7);
  for (const id of ['b', 'd']) {
    const adjacent = state.items[state.items.findIndex(row => row.id === id) + (below ? 1 : -1)];
    assert.equal(adjacent.details, '');
  }
  assert.deepEqual(state.items.filter(row => !row.id.startsWith('op-')).map(row => row.id), ['a', 'b', 'c', 'd', 'e']);
}
state = fixture(); state.openLedgerProductCart(); assert.equal(state.alerts.length, 1); assert.equal(state.cartTarget, undefined);
state = fixture(['d']); state.items[3].details = ''; state.openLedgerProductCart(); assert.equal(state.cartTarget, 'd');
state = fixture(); state.handleInsertSeparator(); assert.equal(state.items[4].isSeparator, true); assert.equal(state.items[3].id, 'd');
assert.doesNotMatch(source, /disabled=\{rowSelectionMode\}/);
console.log('Ledger selection regression checks passed.');
