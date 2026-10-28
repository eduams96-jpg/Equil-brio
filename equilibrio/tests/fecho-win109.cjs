'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Finance = require('../finance.js');
const Casa = require('../casa-model.js');
const CasaLife = require('../casa-life-model.js');
const CasaPilot = require('../casa-finance-pilot-model.js');
const Practical = require('../practical-model.js');
const Gifts = require('../gifts-model.js');
const Life = require('../life-model.js');
const Dossiers = require('../dossiers-model.js');
const { validateLedger } = require('../desktop/ledger-validation.cjs');
const { createSqliteStorage } = require('../desktop/storage-sqlite.cjs');
const { createDesktopBridge } = require('../mobile-sync/server/desktop-bridge.cjs');
const P = require('../mobile-sync/shared/protocol.cjs');

const PDF_RAW = '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF';
const SAMPLE_PDF = 'data:application/pdf;base64,' + Buffer.from(PDF_RAW).toString('base64');
const SAMPLE_PDF_SIZE = Buffer.byteLength(PDF_RAW);

test('1. Centro de avisos geral: agregação, prioridades, filtros, não-mutação financeira e isolamento por espaço', () => {
  const d = Finance.empty();
  const today = Finance.today();
  const addDays = (iso, delta) => {
    const dt = new Date(Date.parse(iso + 'T00:00:00Z') + delta * 86400000);
    return dt.toISOString().slice(0, 10);
  };
  const overdueDate = addDays(today, -5);
  const soonDate = addDays(today, 3);
  const futureSnooze = addDays(today, 5);
  const afterSnooze = addDays(today, 7);

  d.accounts = [{ id: 'acc-1', name: 'Conta Ordem', type: 'Banco', openingBalance: 1500, balance: 1500 }];

  // Pagamentos: atrasado, próximo e já liquidado
  d.pendingPayments.push(
    { id: 'pp-overdue', description: 'Luz em atraso', type: 'expense', amount: 48.5, date: overdueDate, account: 'Conta Ordem', category: 'Casa' },
    { id: 'pp-soon', description: 'Água mensal', type: 'expense', amount: 22.1, date: soonDate, account: 'Conta Ordem', category: 'Casa' }
  );
  Finance.add(d, {
    id: 'tx-paid',
    pendingId: 'pp-paid',
    type: 'expense',
    description: 'Internet paga',
    amount: 34.9,
    date: overdueDate,
    originalDueDate: overdueDate,
    account: 'Conta Ordem',
    category: 'Casa',
    warrantyUntil: soonDate
  });
  d.recurring = [
    { id: 'rec-active', description: 'Ginásio', type: 'expense', amount: 29.9, category: 'Saúde', account: 'Conta Ordem', frequency: 'monthly', day: Number(soonDate.slice(8, 10)), start: today.slice(0, 7) + '-01', active: true },
    { id: 'rec-cancelled', description: 'Clube cancelado', type: 'expense', amount: 15, category: 'Lazer', account: 'Conta Ordem', frequency: 'monthly', day: 10, start: '2026-01-01', active: false }
  ];
  d.subscriptions = [
    { id: 'sub-active', name: 'Streaming Família', amount: 11.99, category: 'Subscrições', account: 'Conta Ordem', frequency: 'monthly', nextDate: soonDate, status: 'active', reminderDays: 7, prices: [] },
    { id: 'sub-cancelled', name: 'App Antiga', amount: 4.99, category: 'Subscrições', account: 'Conta Ordem', frequency: 'monthly', nextDate: soonDate, status: 'cancelled', reminderDays: 7, prices: [] }
  ];

  // Garantias de equipamento
  const eq = Practical.saveEquipment(d, {
    name: 'Máquina de Lavar Roupa',
    cost: 80,
    date: soonDate,
    kind: 'maintenance',
    purchaseDate: '2024-11-02',
    purchasePrice: 499.9,
    warranty: soonDate
  });

  // Validades alimentares
  const prodId = Casa.saveProduct(d, { name: 'Iogurte Natural', category: 'Laticínios', unit: 'un' });
  const lotId = CasaLife.lot(d, { catalogId: prodId, qty: 4, location: 'Frigorífico', expiry: soonDate, opened: false });

  // Rotina doméstica
  const routine = Dossiers.saveRoutine(d, {
    title: 'Limpar filtro da máquina',
    area: 'Lavandaria',
    frequency: 'monthly',
    nextDate: overdueDate,
    equipmentId: eq.id,
    checklist: ['Desligar tomada', 'Drenar água residual', 'Limpar filtro']
  });

  // Renovações de veículo e habitação
  const veh = Dossiers.saveVehicle(d, {
    name: 'Utilitário Familiar',
    plate: 'AA-00-BB',
    fuelType: 'diesel',
    nextInspectionDate: overdueDate,
    insuranceDate: soonDate,
    iucDate: soonDate
  });
  const house = Dossiers.saveHousing(d, {
    name: 'Apartamento Principal',
    kind: 'own',
    insuranceDate: soonDate,
    imiDate: soonDate
  });

  const res = Dossiers.notices(d, { today });
  assert.ok(res.rows.length >= 10, 'Deve agregar pagamentos, garantias, validades, rotinas e renovações ativas');
  assert.ok(res.rows.some(n => n.id === 'pending:pp-overdue' && n.effectiveState === 'overdue' && n.priority === 'high'));
  assert.ok(res.rows.some(n => n.id === 'pending:pp-soon' && n.area === 'payments'));
  assert.ok(!res.rows.some(n => n.id === 'pending:pp-paid'), 'Compromisso já pago não deve surgir nos avisos ativos');
  assert.ok(res.all.some(n => n.id === 'pending:pp-paid' && n.effectiveState === 'paid'), 'Compromisso pago fica consultável nos resolvidos');
  assert.ok(res.rows.some(n => n.id === `recurring:rec-active:${soonDate}` && n.area === 'payments'), 'Recorrência ativa (ex.: água/ginásio) deve aparecer nos avisos ativos');
  assert.ok(!res.rows.some(n => n.id === 'recurring:rec-cancelled'), 'Recorrência inativa não surge como ativa');
  assert.ok(!res.rows.some(n => n.id === 'subscription:sub-cancelled'), 'Subscrição cancelada não surge como ativa');
  assert.ok(res.rows.some(n => n.id === `warranty-eq:${eq.id}:${soonDate}` && n.area === 'warranties'));
  assert.ok(res.rows.some(n => n.id === `warranty-tx:tx-paid:${soonDate}` && n.area === 'warranties'));
  assert.ok(res.rows.some(n => n.id === `food-expiry:${lotId}:${soonDate}` && n.area === 'food'));
  assert.ok(res.rows.some(n => n.id === `routine:${routine.id}:${overdueDate}` && n.area === 'routines'));
  assert.ok(res.rows.some(n => n.id === `vehicle:${veh.id}:nextInspectionDate:${overdueDate}` && n.area === 'dossiers'));
  assert.ok(res.rows.some(n => n.id === `housing:${house.id}:insuranceDate:${soonDate}` && n.area === 'dossiers'));

  // Guardar snapshot financeiro e de origens antes de rever/adiar/dispensar avisos
  const snapshotBefore = JSON.stringify({
    accounts: d.accounts,
    transactions: d.transactions,
    pendingPayments: d.pendingPayments,
    stock: d.casa.stock,
    equipment: d.practical.equipment,
    routines: d.practical.routines,
    vehicles: d.practical.vehicles,
    housing: d.practical.housing
  });

  Dossiers.reviewNotice(d, 'pending:pp-overdue', 'snoozed', futureSnooze);
  Dossiers.reviewNotice(d, `food-expiry:${lotId}:${soonDate}`, 'dismissed');
  Dossiers.reviewNotice(d, `routine:${routine.id}:${overdueDate}`, 'paid');

  const snapshotAfter = JSON.stringify({
    accounts: d.accounts,
    transactions: d.transactions,
    pendingPayments: d.pendingPayments,
    stock: d.casa.stock,
    equipment: d.practical.equipment,
    routines: d.practical.routines,
    vehicles: d.practical.vehicles,
    housing: d.practical.housing
  });
  assert.equal(snapshotAfter, snapshotBefore, 'Resolver/dispensar/adiar avisos nunca pode pagar, apagar ou alterar a origem');

  const activeNow = Dossiers.notices(d, { today }).rows;
  assert.ok(!activeNow.some(n => n.id === 'pending:pp-overdue'));
  assert.ok(!activeNow.some(n => n.id === `food-expiry:${lotId}:${soonDate}`));
  assert.ok(!activeNow.some(n => n.id === `routine:${routine.id}:${overdueDate}`));

  // Quando a data de adiamento passa, o aviso volta a aparecer
  const activeAfterSnooze = Dossiers.notices(d, { today: afterSnooze }).rows;
  assert.ok(activeAfterSnooze.some(n => n.id === 'pending:pp-overdue'), 'Aviso adiado deve reaparecer após a data de adiamento');

  // Concluir a rotina avança nextDate e gera novo aviso para a nova data
  Dossiers.completeRoutine(d, routine.id, { date: today });
  const nextDue = d.practical.routines[0].nextDate;
  const activeNextMonth = Dossiers.notices(d, { today: nextDue }).rows;
  assert.ok(activeNextMonth.some(n => n.id === `routine:${routine.id}:${nextDue}`), 'Nova ocorrência com data diferente deve gerar novo aviso');

  // Reativar aviso dispensado
  Dossiers.restoreNotice(d, `food-expiry:${lotId}:${soonDate}`);
  assert.ok(Dossiers.notices(d, { today, area: 'food' }).rows.some(n => n.id === `food-expiry:${lotId}:${soonDate}`));
});

test('2. Equipamentos, rotinas domésticas e custo acumulado sem dupla contagem', () => {
  const d = Finance.empty();
  d.accounts = [{ id: 'acc-1', name: 'Banco', type: 'Banco', openingBalance: 2000, balance: 2000 }];

  const eq = Practical.saveEquipment(d, {
    name: 'Caldeira Mural',
    cost: 95,
    date: '2026-11-15',
    kind: 'maintenance',
    purchaseDate: '2023-03-15',
    purchasePrice: 1200,
    warranty: '2026-03-15'
  });

  // Despesa paga ligada ao equipamento e também referenciada numa intervenção (não pode duplicar!)
  Finance.add(d, {
    id: 'tx-maint-1',
    type: 'expense',
    description: 'Revisão anual da caldeira',
    amount: 85,
    date: '2025-11-10',
    account: 'Banco',
    category: 'Casa',
    equipmentId: eq.id
  });
  Practical.addIntervention(d, {
    equipmentId: eq.id,
    date: '2025-11-10',
    cost: 85,
    description: 'Revisão anual e limpeza de queimador',
    transactionId: 'tx-maint-1'
  });

  // Intervenção histórica sem movimento bancário
  Practical.addIntervention(d, {
    equipmentId: eq.id,
    date: '2024-11-10',
    cost: 40,
    description: 'Substituição de válvula'
  });

  // Outra despesa ligada diretamente ao equipamento sem intervenção
  Finance.add(d, {
    id: 'tx-accessory',
    type: 'expense',
    description: 'Termóstato inteligente para caldeira',
    amount: 60,
    date: '2026-01-20',
    account: 'Banco',
    category: 'Casa',
    equipmentId: eq.id
  });

  // Compromisso futuro planeado (não pago)
  d.pendingPayments.push({
    id: 'pp-maint-future',
    description: 'Revisão preventiva 2026',
    type: 'expense',
    amount: 95,
    date: '2026-11-15',
    account: 'Banco',
    category: 'Casa',
    equipmentId: eq.id
  });
  d.practical.equipment[0].pendingId = 'pp-maint-future';

  const cost = Dossiers.equipmentCosts(d, eq.id);
  assert.equal(cost.purchasePrice, 1200);
  assert.equal(cost.interventionsTotal, 125); // 85 + 40
  assert.equal(cost.directTransactionsTotal, 60); // Apenas tx-accessory (tx-maint-1 já está na intervenção)
  assert.equal(cost.effectiveMaintenanceTotal, 185); // 125 + 60
  assert.equal(cost.accumulatedTotal, 1385); // 1200 + 185
  assert.equal(cost.plannedFutureCost, 95); // Compromisso futuro separado do custo acumulado pago
});

test('3. Casa -> Consumos (água, eletricidade e gás): leituras, comparação mensal e substituição de contador', () => {
  const d = Finance.empty();
  const txCountBefore = d.transactions.length;

  Dossiers.saveUtilityReading(d, { utility: 'water', date: '2026-08-31', reading: 120.5, unit: 'm3' });
  Dossiers.saveUtilityReading(d, { utility: 'water', date: '2026-09-30', reading: 131.0, unit: 'm3' });
  Dossiers.saveUtilityReading(d, { utility: 'water', date: '2026-10-31', reading: 143.5, unit: 'm3' });

  // Eletricidade com substituição/reinício de contador em outubro
  Dossiers.saveUtilityReading(d, { utility: 'electricity', date: '2026-08-31', reading: 4500, unit: 'kWh' });
  Dossiers.saveUtilityReading(d, { utility: 'electricity', date: '2026-09-30', reading: 4720, unit: 'kWh' });
  Dossiers.saveUtilityReading(d, { utility: 'electricity', date: '2026-10-05', reading: 0, unit: 'kWh', kind: 'reset', meter: 'Contador Bi-horário' });
  Dossiers.saveUtilityReading(d, { utility: 'electricity', date: '2026-10-31', reading: 195, unit: 'kWh', meter: 'Contador Bi-horário' });

  const waterComp = Dossiers.utilityComparison(d, { utility: 'water' });
  assert.equal(waterComp.readingsCount, 3);
  assert.equal(waterComp.monthly.length, 2);
  assert.equal(waterComp.monthly[0].month, '2026-10');
  assert.equal(waterComp.monthly[0].consumption, 12.5);
  assert.equal(waterComp.monthly[0].previousConsumption, 10.5);
  assert.equal(waterComp.monthly[0].deltaConsumption, 2);

  const elecComp = Dossiers.utilityComparison(d, { utility: 'electricity' });
  const resetEntry = elecComp.intervals.find(i => i.kind === 'reset');
  assert.ok(resetEntry, 'Substituição de contador deve ser assinalada sem inventar consumo');
  assert.equal(resetEntry.consumption, null);
  const octElec = elecComp.monthly.find(m => m.month === '2026-10');
  assert.equal(octElec.consumption, 195);
  assert.equal(d.transactions.length, txCountBefore, 'Registar leituras nunca cria despesas financeiras');
});

test('4. Pesquisa no conteúdo dos PDFs: movimentos, Casa, equipamento, veículo e habitação com preservação de ficheiros', () => {
  const d = Finance.empty();
  d.accounts = [{ id: 'acc-1', name: 'Banco', type: 'Banco', openingBalance: 1000, balance: 1000 }];

  Finance.add(d, {
    id: 'tx-pdf-1',
    type: 'expense',
    description: 'Seguro Automóvel Anual',
    amount: 310,
    date: '2026-10-05',
    account: 'Banco',
    category: 'Transportes',
    attachment: { name: 'apolice-auto.pdf', type: 'application/pdf', size: SAMPLE_PDF_SIZE, data: SAMPLE_PDF },
    receiptText: 'Apólice n.º 998877 Cobertura Responsabilidade Civil e Quebra Isolada de Vidros'
  });

  const eq = Practical.saveEquipment(d, {
    name: 'Forno Encastre',
    document: { name: 'manual-forno.pdf', type: 'application/pdf', size: SAMPLE_PDF_SIZE, data: SAMPLE_PDF, text: 'Certificado de garantia Bosch Série 6 ref HBG5370B0', ocrStatus: 'text' }
  });

  const veh = Dossiers.saveVehicle(d, { name: 'Carrinha Familiar', plate: '11-CC-22', fuelType: 'diesel' });
  const vehDoc = Dossiers.addVehicleDocument(d, veh.id, {
    title: 'Inspeção Periódica IPO',
    category: 'Inspeção',
    date: '2026-10-12',
    document: { name: 'ipo-2026.pdf', type: 'application/pdf', size: SAMPLE_PDF_SIZE, data: SAMPLE_PDF, text: 'Centro de Inspeções Automóveis aprovação sem deficiências matrícula 11-CC-22', ocrStatus: 'text' }
  });

  const house = Dossiers.saveHousing(d, { name: 'Moradia Principal', kind: 'own' });
  const houseDoc = Dossiers.addHousingDocument(d, house.id, {
    title: 'Certificado Energético',
    category: 'Certificado',
    date: '2026-09-01',
    document: { name: 'ce-moradia.pdf', type: 'application/pdf', size: SAMPLE_PDF_SIZE, data: SAMPLE_PDF, text: 'Classe Energética A+ painéis solares térmicos e bomba de calor', ocrStatus: 'text' }
  });

  const hitsVidros = Dossiers.searchPdfs(d, 'Quebra Isolada de Vidros');
  assert.equal(hitsVidros.length, 1);
  assert.equal(hitsVidros[0].ownerId, 'tx-pdf-1');

  const hitsBosch = Dossiers.searchPdfs(d, 'HBG5370B0');
  assert.equal(hitsBosch.length, 1);
  assert.equal(hitsBosch[0].ownerId, eq.id);

  const hitsIpo = Dossiers.searchPdfs(d, '11-CC-22');
  assert.equal(hitsIpo.length, 1);
  assert.equal(hitsIpo[0].docId, vehDoc.id);

  const hitsCe = Dossiers.searchPdfs(d, 'bomba de calor');
  assert.equal(hitsCe.length, 1);
  assert.equal(hitsCe[0].docId, houseDoc.id);

  // Simular falha de leitura/OCR num PDF: o ficheiro original nunca pode ser alterado nem apagado
  Dossiers.updatePdfText(d, { sourceKind: 'housing', ownerId: house.id, docId: houseDoc.id }, '', 'failed');
  const savedDoc = d.practical.housing[0].documents[0].document;
  assert.equal(savedDoc.data, SAMPLE_PDF, 'Falha de leitura nunca apaga nem altera os bytes do PDF');
  assert.equal(savedDoc.ocrStatus, 'failed');

  // Pesquisa global LifeFinance também encontra veículos, habitação e equipamentos
  const lifeResults = Life.search(d, '11-CC-22');
  assert.ok(lifeResults.some(r => r.kind === 'Veículo'));
});

test('5. Ficha do veículo e Dossier da habitação: quilometragem, abastecimentos, manutenção, património e custos sem duplicação', () => {
  const d = Finance.empty();
  d.accounts = [{ id: 'acc-1', name: 'Banco', type: 'Banco', openingBalance: 5000, balance: 5000 }];
  d.assets = [
    { id: 'asset-car', name: 'Peugeot 308 SW', kind: 'Veículo', valuations: [{ date: '2026-10-01', value: 14500 }] },
    { id: 'asset-home', name: 'Apartamento T3', kind: 'Imóvel', valuations: [{ date: '2026-10-01', value: 245000 }] }
  ];

  const veh = Dossiers.saveVehicle(d, {
    name: 'Peugeot 308 SW',
    plate: '88-ZZ-99',
    fuelType: 'diesel',
    assetId: 'asset-car',
    currentKm: 84000,
    insuranceDate: '2026-12-01'
  });

  Dossiers.addVehicleMileage(d, veh.id, { date: '2026-09-01', km: 84000, note: 'Início do mês' });
  Dossiers.addVehicleMileage(d, veh.id, { date: '2026-10-01', km: 84800, note: 'Viagem norte' });
  assert.throws(() => Dossiers.addVehicleMileage(d, veh.id, { date: '2026-10-15', km: 84200 }), /não pode ser inferior/);

  Finance.add(d, {
    id: 'tx-fuel-1',
    type: 'expense',
    description: 'Gasóleo autoestrada',
    amount: 72.8,
    date: '2026-10-01',
    account: 'Banco',
    category: 'Transportes'
  });
  Dossiers.addVehicleFueling(d, veh.id, {
    date: '2026-10-01',
    quantity: 44,
    cost: 72.8,
    km: 84800,
    station: 'Galp',
    fullTank: true,
    transactionId: 'tx-fuel-1'
  });

  Finance.add(d, {
    id: 'tx-maint-car',
    type: 'expense',
    description: 'Mudança de óleo e filtros',
    amount: 165,
    date: '2026-10-10',
    account: 'Banco',
    category: 'Transportes'
  });
  Dossiers.addVehicleMaintenance(d, veh.id, {
    date: '2026-10-10',
    kind: 'revision',
    description: 'Mudança de óleo e filtros',
    km: 85000,
    cost: 165,
    transactionId: 'tx-maint-car',
    nextDate: '2027-10-10',
    nextKm: 100000
  });

  const vSum = Dossiers.vehicleSummary(d, veh.id);
  assert.equal(vSum.currentKm, 85000);
  assert.equal(vSum.assetValue, 14500);
  assert.equal(vSum.fuelCost, 72.8);
  assert.equal(vSum.maintenanceCost, 165);
  assert.equal(vSum.totalEffectiveCost, 237.8);
  assert.equal(vSum.linkedCost, 237.8);
  assert.equal(vSum.unlinkedCost, 0);

  // Habitação ligada a património, equipamento, rotina e movimento (sem duplicar despesa já ligada ao equipamento)
  const eq = Practical.saveEquipment(d, { name: 'Esquentador', purchasePrice: 320 });
  const r = Dossiers.saveRoutine(d, { title: 'Ventilar arrecadação', frequency: 'monthly', nextDate: '2026-11-01', equipmentId: eq.id });
  Finance.add(d, {
    id: 'tx-condo',
    type: 'expense',
    description: 'Quota de condomínio outubro',
    amount: 45,
    date: '2026-10-08',
    account: 'Banco',
    category: 'Casa'
  });
  const h = Dossiers.saveHousing(d, {
    name: 'Apartamento T3',
    kind: 'own',
    addressNote: 'Rua Principal, 10',
    assetId: 'asset-home',
    equipmentIds: [eq.id],
    routineIds: [r.id],
    transactionIds: ['tx-condo'],
    imiDate: '2026-11-30'
  });

  const hSum = Dossiers.housingSummary(d, h.id);
  assert.equal(hSum.assetValue, 245000);
  assert.equal(hSum.equipmentCount, 1);
  assert.equal(hSum.equipmentTotal, 320);
  assert.equal(hSum.routinesCount, 1);
  assert.equal(hSum.directExpensesTotal, 45);
  assert.equal(hSum.accumulatedTotal, 365);
});

test('6. Ligação Windows <-> Android (createDesktopBridge) e isolamento por espaço preservam todos os domínios 1.0.8 e 1.0.9', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eq-win109-bridge-'));
  try {
    const storage = createSqliteStorage(dir);
    const seed = P.fixture();
    const otherSpace = P.fixture();

    // Preencher todos os domínios 1.0.8 e 1.0.9 no espaço principal
    seed.recurring = [{ id: 'rec-bi', description: 'Água bimestral', type: 'expense', amount: 38, category: 'Casa', account: 'Conta à ordem', frequency: 'bimonthly', day: 10, start: '2026-01-10', active: true }];
    seed.subscriptions = [{ id: 'sub-bi', name: 'Revista Técnica', amount: 18, category: 'Subscrições', account: 'Conta à ordem', frequency: 'monthly', nextDate: '2026-11-15', status: 'active', reminderDays: 7, prices: [] }];
    const storeId = Casa.saveStore(seed, { name: 'Continente' });
    const prodId = Casa.saveProduct(seed, { name: 'Azeite Virgem Extra', category: 'Mercearia', unit: 'L', url: 'https://www.continente.pt/produto/azeite' });
    Casa.setOffer(seed, prodId, storeId, { packageQty: 0.75, price: 6.49, url: 'https://www.continente.pt/produto/azeite-075' });
    CasaPilot.setEnabled(seed, true);
    Gifts.save(seed, { person: 'Maria', title: 'Livro de História', occasion: 'Natal 2026', year: 2026, date: '2026-12-25', status: 'idea', budget: 24.9 });
    const eq = Practical.saveEquipment(seed, {
      name: 'Frigorífico Combinado',
      purchasePrice: 680,
      document: { name: 'fatura-frigorifico.pdf', type: 'application/pdf', size: SAMPLE_PDF_SIZE, data: SAMPLE_PDF, text: 'Frigorífico No Frost Série 4', ocrStatus: 'text' }
    });
    const rout = Dossiers.saveRoutine(seed, { title: 'Descongelar e limpar borrachas', frequency: 'quarterly', nextDate: '2026-11-01', equipmentId: eq.id, checklist: ['Limpar juntas'] });
    Dossiers.saveUtilityReading(seed, { utility: 'electricity', date: '2026-10-01', reading: 1250, unit: 'kWh' });
    const veh = Dossiers.saveVehicle(seed, { name: 'Carro Principal', plate: '12-AB-34', fuelType: 'diesel', currentKm: 42000 });
    Dossiers.addVehicleDocument(seed, veh.id, { title: 'DUA', document: { name: 'dua.pdf', type: 'application/pdf', size: SAMPLE_PDF_SIZE, data: SAMPLE_PDF, text: 'Documento Único Automóvel 12-AB-34', ocrStatus: 'text' } });
    const house = Dossiers.saveHousing(seed, { name: 'Casa Principal', kind: 'own', equipmentIds: [eq.id] });
    Dossiers.addHousingDocument(seed, house.id, { title: 'Caderneta Predial', document: { name: 'caderneta.pdf', type: 'application/pdf', size: SAMPLE_PDF_SIZE, data: SAMPLE_PDF, text: 'Caderneta Predial Urbana Artigo 445', ocrStatus: 'text' } });
    Dossiers.reviewNotice(seed, `routine:${rout.id}:2026-11-01`, 'dismissed');

    const validatedSeed = validateLedger(seed);
    const validatedOther = validateLedger(otherSpace);
    storage.writeState({
      equilibrioSpaces: JSON.stringify([
        { id: 'main', name: 'Casa Principal', key: 'equilibrioData' },
        { id: 'privado', name: 'Espaço Privado', key: 'equilibrioData:privado' }
      ]),
      equilibrioData: JSON.stringify(validatedSeed),
      'equilibrioData:privado': JSON.stringify(validatedOther)
    });

    // Isolamento entre espaços financeiros
    assert.equal(Dossiers.vehicles(storage.readSpace('privado').data).length, 0);
    assert.equal(Dossiers.vehicles(storage.readSpace('main').data).length, 1);

    const bridge = createDesktopBridge(dir, { desktop: storage });
    try {
      const state0 = bridge.store.read().state;
      const bootstrap = {
        serverId: state0.serverId,
        epoch: state0.epoch,
        spaceId: 'main',
        snapshot: {
          ledger: P.copy(state0.spaces.main.ledger),
          revisions: P.copy(state0.spaces.main.revisions),
          cursor: state0.spaces.main.cursor
        }
      };
      const mobileState = P.local(bootstrap, 'android-device-1');
      const op = P.prepare(mobileState, 'movement.add', {
        id: 'tx-mobile-1',
        type: 'expense',
        amountCents: 1850,
        description: 'Padaria via Android',
        category: 'Alimentação',
        accountId: 'bank',
        date: '2026-10-25'
      });

      const nextLedger = P.copy(state0.spaces.main.ledger);
      P.apply(nextLedger, op.command, op.payload);
      const checked = validateLedger(nextLedger);
      assert.equal(checked.recurring[0].frequency, 'bimonthly');
      assert.equal(checked.casa.catalog[0].offers[storeId].url, 'https://www.continente.pt/produto/azeite-075');
      assert.equal(checked.casa.financePilotEnabled, true);
      assert.equal(checked.practical.gifts.length, 1);
      assert.equal(checked.practical.equipment[0].purchasePrice, 680);
      assert.equal(checked.practical.equipment[0].document.text, 'Frigorífico No Frost Série 4');
      assert.equal(checked.practical.routines.length, 1);
      assert.equal(checked.practical.vehicles.length, 1);
      assert.equal(checked.practical.housing.length, 1);
      assert.equal(checked.casa.utilityReadings.length, 1);
      assert.equal(checked.practical.noticeReviews.length, 1);
    } finally {
      await bridge.close();
      storage.close();
    }
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch {}
  }
});

test('8. Catálogo Casa (supermercado sem preço + importação de tabela Excel com links na marca) e Prendas (ocasiões e lista anual em falta)', () => {
  const d = Finance.empty();
  d.accounts = [{ id: 'acc-1', name: 'Banco', type: 'Banco', openingBalance: 1000, balance: 1000 }];

  // 1. Supermercado registado sem preço (price: 0)
  const pId = Casa.saveProductOffers(
    d,
    { name: 'Amêndoa Laminada', category: 'Mercearia', unit: 'un', brand: 'Continente' },
    [{ storeName: 'Continente', packageQty: 1, price: 0, url: 'https://www.continente.pt/produto/amendoa' }]
  );
  assert.equal(CasaLife.prices(d, pId).length, 0, 'Oferta sem preço não entra no ranking de mais barato');
  const missing = CasaLife.missingPriceOffers(d, pId);
  assert.equal(missing.length, 1, 'Supermercado sem preço surge em missingPriceOffers para exibir aviso');
  assert.equal(missing[0].storeName, 'Continente');
  assert.equal(missing[0].url, 'https://www.continente.pt/produto/amendoa');

  // 2. Importação de tabela Excel com links na Marca, múltiplas lojas e conversão 750 ml + 1 L
  const importRes = Casa.importCatalogTable(d, [
    { name: 'Água Micelar', category: 'Higiene', unitQty: '400 ml', brand: 'BeBeauty', storeName: 'Mercadona', price: '2,90 €', stock: 1, url: 'https://loja.exemplo.pt/agua-micelar' },
    { name: 'Anti-Calcário Casa de Banho', category: 'Limpeza', unitQty: '750 ml', brand: 'Viakal', storeName: 'Continente', price: '4,99 €', stock: 1, url: 'https://www.continente.pt/viakal' },
    { name: 'Anti-Calcário Casa de Banho', category: 'Limpeza', unitQty: '1 L', brand: 'Cillit Bang', storeName: 'Pingo Doce', price: '4,59 €', stock: 1, url: 'https://www.pingodoce.pt/cillit-bang' },
    { name: 'Arroz Agulha', category: 'Mercearia', unitQty: '2 kg', brand: 'Cigala', storeName: 'Continente', price: '2,78 €', stock: 1, url: 'https://www.continente.pt/cigala' }
  ]);
  assert.equal(importRes.productsCreated, 3);
  assert.equal(importRes.offersSaved, 4);

  const antiCalc = d.casa.catalog.find(p => p.name === 'Anti-Calcário Casa de Banho');
  assert.ok(antiCalc);
  assert.equal(antiCalc.unit, 'ml', 'Converte 750 ml e 1 L para a mesma unidade base (ml)');
  const antiPrices = CasaLife.prices(d, antiCalc.id);
  assert.equal(antiPrices.length, 2, 'Ambas as ofertas (Continente 750 ml e Pingo Doce 1000 ml) ficam comparáveis');
  assert.equal(antiPrices[0].packageQty, 1000, 'Pingo Doce 1 L (1000 ml) por 4,59 € é o mais barato por ml');
  assert.equal(antiPrices[0].url, 'https://www.pingodoce.pt/cillit-bang');

  // 3. Prendas: ocasiões comuns + personalizadas e lista anual do que falta
  Gifts.savePersonOccasions(d, {
    person: 'Mãe',
    occasions: ['Natal', 'Dia da Mãe', 'Aniversário'],
    budget: 35
  });
  Gifts.save(d, {
    person: 'Mãe',
    title: 'Perfume Floral',
    occasion: 'Dia da Mãe',
    year: 2026,
    status: 'bought',
    budget: 35,
    actualCost: 32.5
  });
  Gifts.save(d, {
    person: 'Mãe',
    title: 'Echarpe de Seda',
    occasion: 'Aniversário',
    year: 2026,
    status: 'idea',
    budget: 35
  });

  const occs = Gifts.occasions(d);
  assert.ok(occs.includes('Natal') && occs.includes('Dia da Mãe') && occs.includes('Aniversário'));
  const checklist = Gifts.yearChecklist(d, 2026);
  assert.equal(checklist.all.length, 3);
  assert.equal(checklist.ready.length, 1, 'Dia da Mãe já está comprado');
  assert.equal(checklist.pending.length, 1, 'Aniversário está em ideia (falta comprar)');
  assert.equal(checklist.missing.length, 1, 'Natal ainda não tem prenda definida');
  assert.equal(checklist.incomplete.length, 2, 'Faltam 2 ocasiões no ano (Natal + Aniversário)');
  assert.equal(d.transactions.length, 0, 'Nenhuma operação de catálogo ou prendas cria movimentos bancários');
});

test('9. Regressões de interface e integridade de comandos do fecho (DraftUI, isolamento de vistas, subscrições e fecho limpo)', () => {
  const root = path.join(__dirname, '..');
  const draftContent = fs.readFileSync(path.join(root, 'draft-ui.js'), 'utf8');
  const cssContent = fs.readFileSync(path.join(root, 'ui.css'), 'utf8');
  const unifiedJs = fs.readFileSync(path.join(root, 'unified-workspace-ui.js'), 'utf8');
  const dossiersJs = fs.readFileSync(path.join(root, 'dossiers-ui.js'), 'utf8');
  const mainJs = fs.readFileSync(path.join(root, 'desktop', 'main.cjs'), 'utf8');

  // 1. window.DraftUI: todos os métodos existem e não lançam erro
  const requiredDraftMethods = ['begin', 'suspend', 'flush', 'saveReview', 'token', 'complete', 'recover', 'discard', 'observeModal', 'clear', 'refresh', 'restore'];
  for (const m of requiredDraftMethods) {
    assert.match(draftContent, new RegExp(`${m}:`), `DraftUI deve definir o método ${m}`);
  }
  const mockWindow = {};
  const mockDoc = { addEventListener: () => {}, getElementById: () => null, querySelector: () => null };
  new Function('window', 'document', draftContent)(mockWindow, mockDoc);
  assert.ok(mockWindow.DraftUI);
  for (const m of requiredDraftMethods) {
    assert.equal(typeof mockWindow.DraftUI[m], 'function', `DraftUI.${m} tem de ser uma função invocável`);
    assert.doesNotThrow(() => mockWindow.DraftUI[m](), `DraftUI.${m}() não pode lançar exceção`);
  }

  // 2. Isolamento de vistas em ui.css: nunca forçar display:flex sem .active
  assert.doesNotMatch(cssContent, /#noticesHub\.notices-page\{display:flex!important/, 'noticesHub não pode ser forçado display:flex sem .active');
  assert.match(cssContent, /#noticesHub\.notices-page\.active\{display:flex!important/, 'noticesHub deve ter display:flex apenas quando ativo');
  assert.doesNotMatch(cssContent, /#casaConsumos\.consumos-page\{display:flex!important/, 'casaConsumos não pode ser forçado display:flex sem .active');
  assert.match(cssContent, /#casaConsumos\.consumos-page\.active\{display:flex!important/, 'casaConsumos deve ter display:flex apenas quando ativo');

  // 3. Centro de avisos e vistas de topo sem cabeçalho duplicado
  assert.match(cssContent, /body:is\(\[data-current-view="noticesHub"\][\s\S]*?\)\s*:is\(#mainContent>header/, 'Cabeçalho do mainContent tem de ser oculto em noticesHub');
  assert.doesNotMatch(dossiersJs, /RESUMO E CONTROLO/, 'dossiers-ui.js não pode renderizar o texto RESUMO E CONTROLO');

  // 4. Revisão: remoção de diagnósticos desnecessários
  assert.doesNotMatch(unifiedJs, /Transferências, ajustes e histórico/, 'unified-workspace-ui.js não pode conter Transferências, ajustes e histórico');

  // 5. desktop/main.cjs: proteção no fecho com DraftUI?.token
  assert.match(mainJs, /typeof window\.DraftUI\?\.token === "function"|typeof window\.DraftUI\?\.token==="function"/, 'desktop/main.cjs deve verificar typeof DraftUI?.token');
});
