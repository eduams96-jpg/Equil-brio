'use strict';
// Boundary for Casa 0.3.9 receipts. Pure preparation only: no browser storage,
// SQLite, implicit import, or evaluation of the Casa application's globals.
const F = require('../finance.js');
function inspectBackup(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('Cópia Casa inválida.');
  if (payload.data && payload.version !== undefined && payload.version !== '0.3.9') throw Error('Versão Casa não validada para esta adaptação.');
  const source = payload.data || payload;
  for (const key of ['items', 'shopping', 'history', 'recipes']) if (!Array.isArray(source[key])) throw Error('Campo Casa em falta: ' + key);
  for (const key of ['items','shopping','history','recipes','catalog','stores','receipts']) {
    if (source[key] === undefined) continue;
    if (!Array.isArray(source[key])) throw Error('Lista Casa inválida: ' + key);
    const ids = new Set();
    for (const row of source[key]) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('Registo Casa inválido: ' + key);
      if (row.id !== undefined) {
        const id = String(row.id);
        if (!id.trim() || ids.has(id)) throw Error('Identificador Casa inválido/repetido: ' + key);
        ids.add(id);
      }
    }
  }
  return structuredClone(source);
}
function receiptSummary(payload, receiptId) {
  const source = inspectBackup(payload);
  const receipt = source.receipts?.find(r => String(r.id) === String(receiptId));
  if (!receipt) throw Error('Compra Casa não encontrada.');
  if (receipt.id === undefined || receipt.id === null || !String(receipt.id).trim()) throw Error('Identificador da compra em falta.');
  if (!F.validDate(receipt.date)) throw Error('Data da compra inválida.');
  if (typeof receipt.total !== 'number' || !Number.isFinite(receipt.total) || receipt.total <= 0 || !Number.isSafeInteger(F.cents(receipt.total))) throw Error('Total da compra inválido.');
  if (!Array.isArray(receipt.items) || !receipt.items.length) throw Error('A compra não tem artigos para conferir o total.');
  if (receipt.items.some(i => !i || typeof i.total !== 'number' || !Number.isFinite(i.total) || i.total < 0)) throw Error('Total de artigo inválido.');
  // Casa stores pre-rounded floating-point line totals; round once at the
  // receipt boundary, as its current total calculation does.
  if (F.cents(receipt.items.reduce((sum,i) => sum+i.total,0)) !== F.cents(receipt.total)) throw Error('O total da compra não coincide com os artigos.');
  const store = source.stores?.find(s => String(s.id) === String(receipt.storeId));
  if (receipt.storeId && !store) throw Error('Supermercado da compra não encontrado.');
  return { id:String(receipt.id), date:receipt.date, storeId:String(receipt.storeId || ''), storeName:String(store?.name || 'Compra Casa'), amount:F.money(receipt.total), itemCount:receipt.items.length };
}
function prepareMovement(ledger, payload, receiptId, options = {}) {
  const purchase = receiptSummary(payload, receiptId);
  const datasetId = String(options.datasetId || '').trim();
  if (!datasetId) throw Error('Falta a identificação estável da base Casa.');
  const sourceId = JSON.stringify([datasetId,purchase.id]);
  const existing = ledger.transactions.filter(t => t.source === 'Casa+' && t.sourceId === sourceId);
  if (existing.length > 1) throw Error('Existem movimentos duplicados para esta compra.');
  if (existing.length) {
    const tx = existing[0];
    if (tx.type !== 'expense' || tx.amount !== purchase.amount || tx.date !== purchase.date) throw Error('A compra ligada foi alterada; requer reconciliação explícita.');
    return { kind:'existing', transaction:structuredClone(tx), purchase };
  }
  const account = ledger.accounts.find(a => a.name === options.account && !a.archived);
  if (!account) throw Error('Escolhe uma conta ativa.');
  if (purchase.date > F.today()) throw Error('A compra tem uma data futura.');
  const category = String(options.category || '').trim();
  if (!category) throw Error('Escolhe a categoria financeira.');
  const draft = structuredClone(ledger);
  const transaction = F.add(draft, {date:purchase.date,description:purchase.storeName,type:'expense',amount:purchase.amount,account:account.name,category,source:'Casa+',sourceId});
  F.normalize(draft);
  return { kind:'create', transaction, purchase };
}
module.exports = { inspectBackup, receiptSummary, prepareMovement };
