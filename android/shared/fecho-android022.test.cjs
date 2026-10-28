'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const P = require('./protocol.cjs');
const D = require('./drafts.cjs');
const Forms = require('./form-drafts.cjs');
const HouseForm = require('./house-form.cjs');
const Recovery = require('./recovery.cjs');
const { Client } = require('./client.cjs');
const { createDesktopBridge } = require('../server/desktop-bridge.cjs');

const F = require('../../equilibrio/finance.js');
require('../../equilibrio/features-model.js');
require('../../equilibrio/complete-model.js');
require('../../equilibrio/life-model.js');
require('../../equilibrio/planning-model.js');
const Practical = require('../../equilibrio/practical-model.js');
const Casa = require('../../equilibrio/casa-model.js');
require('../../equilibrio/casa-life-model.js');
const Gifts = require('../../equilibrio/gifts-model.js');
const Pilot = require('../../equilibrio/casa-finance-pilot-model.js');
const Dossiers = require('../../equilibrio/dossiers-model.js');

const PDF_RAW = '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF';
const SAMPLE_PDF = 'data:application/pdf;base64,' + Buffer.from(PDF_RAW).toString('base64');
const SAMPLE_PDF_SIZE = Buffer.byteLength(PDF_RAW);

function createMemoryAdapter(initialState) {
  let current = { revision: 1, state: structuredClone(initialState) };
  return new D.SerialAdapter({
    read: async () => structuredClone(current),
    replace: async (state, expectedRevision) => {
      if (expectedRevision !== current.revision) throw Error('LOCAL_REVISION_CONFLICT');
      current = { revision: current.revision + 1, state: structuredClone(state) };
      return structuredClone(current);
    },
  });
}

test('1. Rascunhos Casa e Pagamento de outra associação expõem staleReason, não prendem saída e permitem descarte explícito', async () => {
  const baseState = P.local(
    {
      serverId: 'srv-old',
      epoch: 'ep-old',
      spaceId: 'main',
      snapshot: { ledger: P.fixture(), revisions: P.revisions(P.fixture()), cursor: 1 },
    },
    'dev-old',
  );
  const adapter = createMemoryAdapter(baseState);
  const s0 = (await adapter.read()).state;

  const houseDraft = Forms.create(
    s0,
    { id: 'prod-1', command: 'house.product', mode: 'create', seed: 'seed-1', changedOn: '2026-10-25', name: 'Azeite', category: 'Mercearia', unit: 'L', offers: [] },
    'house',
    0,
  );
  const savedHouse = await Forms.save(adapter, 'houseDraft', houseDraft);
  assert.equal(Forms.staleReason((await adapter.read()).state, savedHouse), '');

  // Simular desligar associação / passagem para novo contexto
  await adapter.mutate((s) => {
    s.serverId = 'unpaired';
    s.epoch = 'unpaired';
    s.deviceId = 'dev-new';
  });

  const afterDetach = (await adapter.read()).state;
  const reason = Forms.staleReason(afterDetach, afterDetach.houseDraft);
  assert.match(reason, /outra associação ou espaço/i);

  // Tentar gravar por cima falha preservando o rascunho original
  await assert.rejects(() => Forms.save(adapter, 'houseDraft', afterDetach.houseDraft), /espaço mudou/);
  assert.deepEqual((await adapter.read()).state.houseDraft, savedHouse);

  // Descarte explícito remove o rascunho sem tocar nos dados financeiros
  await Forms.discard(adapter, 'houseDraft', savedHouse);
  const afterDiscard = (await adapter.read()).state;
  assert.equal(afterDiscard.houseDraft, undefined);
  assert.deepEqual(afterDiscard.confirmed, afterDetach.confirmed);
});

test('2. Compatibilidade Android <-> Windows 1.0.8 e 1.0.9: sincronização, edição Casa e recuperação preservam todos os domínios', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eq-android022-win109-'));
  const bridge = createDesktopBridge(path.join(tmpDir, 'pc-profile'));
  t.after(async () => {
    await bridge.close();
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  const d = bridge.desktop.readSpace('main').data;
  d.recurring.push({
    id: 'rec-bi-1',
    description: 'Água bimestral',
    type: 'expense',
    amount: 34.5,
    frequency: 'bimonthly',
    day: 15,
    start: '2026-01-15',
    account: d.accounts[0].name,
    category: 'Casa',
    active: true,
  });
  d.pendingPayments.push({
    id: 'commit-1',
    description: 'Seguro habitação anual',
    type: 'expense',
    amount: 180,
    date: '2026-10-28',
    account: d.accounts[0].name,
    category: 'Seguros',
  });

  // Casa product with per-store URL (1.0.8)
  Casa.saveProductOffers(
    d,
    { name: 'Arroz Carolino', brand: 'Ceifeira', category: 'Mercearia', unit: 'kg', url: 'https://marca.exemplo/arroz' },
    [{ storeName: 'Continente', packageQty: 1, price: 1.59, url: 'https://continente.exemplo/arroz-1kg' }],
  );
  const createdProdId = d.casa.catalog[0].id;

  // Equipamento com preço de compra, PDF pesquisável e equipamento sem plano (1.0.8 + 1.0.9)
  const eq = Practical.saveEquipment(d, {
    id: 'eq-caldeira',
    name: 'Caldeira Mural',
    purchaseDate: '2024-03-01',
    purchasePrice: 1250,
    warranty: '2027-03-01',
    document: {
      name: 'fatura-caldeira.pdf',
      type: 'application/pdf',
      size: SAMPLE_PDF_SIZE,
      data: SAMPLE_PDF,
      text: 'Caldeira Bosch Condens 2300i W número série BX9988',
      ocrStatus: 'text',
    },
  });

  // Presentes (1.0.8)
  Gifts.save(d, { person: 'Maria', title: 'Livro', occasion: 'Natal', year: 2026, date: '2026-12-25', budget: 25, status: 'idea' });

  // Piloto opcional Compras <-> Movimentos (1.0.8)
  Pilot.setEnabled(d, false);

  // Domínios 1.0.9: Rotinas, Consumos, Veículo, Habitação e Revisões do Centro de Avisos
  const rout = Dossiers.saveRoutine(d, {
    id: 'rout-caldeira',
    title: 'Purgar radiadores e verificar pressão',
    area: 'Aquecimento',
    frequency: 'annual',
    nextDate: '2026-11-01',
    equipmentId: eq.id,
    checklist: ['Verificar manómetro (1,2 a 1,5 bar)', 'Purgar radiadores'],
  });
  Dossiers.saveUtilityReading(d, { utility: 'water', date: '2026-09-30', reading: 140, unit: 'm3' });
  Dossiers.saveUtilityReading(d, { utility: 'electricity', date: '2026-09-30', reading: 2450, unit: 'kWh' });
  Dossiers.saveUtilityReading(d, { utility: 'gas', date: '2026-09-30', reading: 310, unit: 'm3' });

  const veh = Dossiers.saveVehicle(d, {
    id: 'veh-peugeot',
    name: 'Peugeot 2008',
    plate: '11-ZZ-22',
    makeModel: 'Peugeot 2008',
    year: 2022,
    fuelType: 'gasoline',
    currentKm: 41200,
    nextInspectionDate: '2026-11-15',
  });
  Dossiers.addVehicleDocument(d, veh.id, {
    title: 'Inspeção IPO',
    category: 'Inspeção',
    date: '2025-11-15',
    document: { name: 'ipo.pdf', type: 'application/pdf', size: SAMPLE_PDF_SIZE, data: SAMPLE_PDF, text: 'Inspeção aprovada sem deficiências', ocrStatus: 'text' },
  });

  const house = Dossiers.saveHousing(d, {
    id: 'house-main',
    name: 'Apartamento Lisboa',
    kind: 'own',
    typology: 'T2',
    equipmentIds: [eq.id],
    routineIds: [rout.id],
  });
  Dossiers.addHousingDocument(d, house.id, {
    title: 'Caderneta Predial',
    category: 'IMI / impostos',
    date: '2026-01-10',
    document: { name: 'caderneta.pdf', type: 'application/pdf', size: SAMPLE_PDF_SIZE, data: SAMPLE_PDF, text: 'Artigo matricial 4455 fração C', ocrStatus: 'text' },
  });

  Dossiers.reviewNotice(d, 'pending:commit-1', 'snoozed', '2099-01-01');
  bridge.desktop.writeSpace('equilibrioData', d);
  bridge.refresh();

  // Emparelhar cliente Android com o bridge Windows 1.0.9
  const url = await bridge.listen();
  const token = bridge.provision('dev-022', ['main']);
  const request = async (method, urlPath, body) => {
    const r = await fetch(url + urlPath, {
      method,
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const value = await r.json();
    if (r.status >= 400 && value.status !== 'epoch-mismatch') throw Object.assign(Error(value.message || 'HTTP ' + r.status), { status: r.status });
    return value;
  };
  const opened = await request('GET', '/api/v1/spaces/main/bootstrap');

  const androidAdapter = createMemoryAdapter(P.local(opened, 'dev-022'));
  const client = new Client(androidAdapter, request, { negotiate: true });

  // Editar no Android o produto Casa mantendo o URL da oferta por supermercado
  const storeId = Object.keys(d.casa.catalog[0].offers)[0];
  const existingOffer = d.casa.catalog[0].offers[storeId];
  assert.equal(existingOffer.url, 'https://continente.exemplo/arroz-1kg');

  const productPayload = HouseForm.payload({
    id: createdProdId,
    command: 'house.product',
    mode: 'update',
    seed: 'seed022',
    changedOn: '2026-10-25',
    name: 'Arroz Carolino',
    brand: 'Ceifeira',
    category: 'Mercearia',
    sub1: '',
    sub2: '',
    sub3: '',
    unit: 'kg',
    url: 'https://marca.exemplo/arroz',
    offers: [{ storeName: 'Continente', packageQty: '1', price: '1,49', url: existingOffer.url }],
  });
  await client.enqueue('house.product', productPayload);
  await client.sync();

  // Verificar no Windows SQLite que o preço atualizou para 1.49 E o url da oferta + todos os domínios 1.0.8/1.0.9 continuam intactos
  const afterSync = bridge.desktop.readSpace('main').data;
  const updatedOffer = afterSync.casa.catalog[0].offers[storeId];
  assert.equal(updatedOffer.price, 1.49);
  assert.equal(updatedOffer.url, 'https://continente.exemplo/arroz-1kg');
  assert.equal(afterSync.recurring[0].frequency, 'bimonthly');
  assert.equal(afterSync.practical.equipment[0].purchasePrice, 1250);
  assert.equal(afterSync.practical.equipment[0].document.text, 'Caldeira Bosch Condens 2300i W número série BX9988');
  assert.equal(afterSync.practical.gifts.length, 1);
  assert.equal(afterSync.practical.routines.length, 1);
  assert.equal(afterSync.casa.utilityReadings.length, 3);
  assert.equal(afterSync.practical.vehicles.length, 1);
  assert.equal(afterSync.practical.vehicles[0].documents[0].document.text, 'Inspeção aprovada sem deficiências');
  assert.equal(afterSync.practical.housing.length, 1);
  assert.equal(afterSync.practical.housing[0].documents[0].document.text, 'Artigo matricial 4455 fração C');
  assert.equal(afterSync.practical.noticeReviews.length, 1);

  // Verificar cópia encriptada e desencriptação no Android com todos os domínios 1.0.8/1.0.9
  const androidState = (await androidAdapter.read()).state;
  const encrypted = await Recovery.encrypt(androidState, 'Password-Forte-2026!');
  const decrypted = await Recovery.decrypt(encrypted, 'Password-Forte-2026!');
  assert.deepEqual(decrypted.confirmed.ledger.practical, afterSync.practical);
  assert.deepEqual(decrypted.confirmed.ledger.casa.utilityReadings, afterSync.casa.utilityReadings);
});
