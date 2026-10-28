/* Centro de avisos geral, rotinas domésticas, custo acumulado de equipamentos,
   consumos (água, eletricidade e gás), pesquisa em PDFs, ficha do veículo e
   dossier da habitação. Todas as operações validam e preservam a integridade
   do ledger sem criar nem alterar movimentos financeiros silenciosamente. */
(function (root) {
  "use strict";
  const F = () => root.Finance || (typeof require === "function" ? require("./finance.js") : null);
  const P = () => root.PracticalFinance || (typeof require === "function" ? require("./practical-model.js") : null);
  const C = () => root.CasaFinance || (typeof require === "function" ? require("./casa-model.js") : null);
  const CL = () => root.CasaLife || (typeof require === "function" ? require("./casa-life-model.js") : null);

  const clone = (x) => structuredClone(x);
  const text = (v, max = 200) => typeof v === "string" && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
  const nonEmpty = (v, max = 200) => text(v, max) && v.trim().length > 0;
  const validId = (v) => nonEmpty(v, 100);
  const optDate = (v) => v === "" || v === undefined || v === null || F().validDate(v);
  const moneyOrZero = (v) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) && n >= 0 && Number.isSafeInteger(F().cents(n)) && F().money(n) === n;
  };
  const round3 = (n) => Math.round(Number(n) * 1000) / 1000;
  const round4 = (n) => Math.round(Number(n) * 10000) / 10000;
  const validDec3 = (v, allowZero = true) => {
    const n = Number(v);
    return Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) && n <= 999999999 && round3(n) === n;
  };
  const fold = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-PT")
      .trim();

  const dayDiff = (from, to) =>
    Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 86400000);

  const addDays = (dateStr, days) => {
    const dt = new Date(dateStr + "T12:00:00Z");
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  };

  const addMonths = (dateStr, months) => {
    const y = Number(dateStr.slice(0, 4));
    const m = Number(dateStr.slice(5, 7));
    const day = Number(dateStr.slice(8, 10));
    const total = y * 12 + (m - 1) + months;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    const ym = `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}`;
    return F().dateAt(ym, day);
  };

  const FREQUENCIES = {
    weekly: { label: "Semanal", advance: (d) => addDays(d, 7) },
    monthly: { label: "Mensal", advance: (d) => addMonths(d, 1) },
    bimonthly: { label: "Bimestral", advance: (d) => addMonths(d, 2) },
    quarterly: { label: "Trimestral", advance: (d) => addMonths(d, 3) },
    semiannual: { label: "Semestral", advance: (d) => addMonths(d, 6) },
    annual: { label: "Anual", advance: (d) => addMonths(d, 12) },
  };

  const UTILITIES = {
    water: { label: "Água", units: ["m3"], defaultUnit: "m3" },
    electricity: { label: "Eletricidade", units: ["kWh"], defaultUnit: "kWh" },
    gas: { label: "Gás", units: ["m3", "kWh"], defaultUnit: "m3" },
  };

  const UNIT_LABELS = { m3: "m³", kWh: "kWh", L: "L" };

  const VEHICLE_FUELS = {
    gasoline: "Gasolina",
    diesel: "Gasóleo",
    hybrid: "Híbrido",
    electric: "Elétrico",
    lpg: "GPL",
    other: "Outro",
  };

  const VEHICLE_MAINT_KINDS = {
    revision: "Revisão / manutenção",
    repair: "Reparação",
    inspection: "Inspeção periódica",
    iuc: "IUC / imposto",
    insurance: "Seguro",
    tires: "Pneus / travões",
    other: "Outro",
  };

  const HOUSING_KINDS = {
    own: "Habitação própria",
    rented: "Habitação arrendada",
    other: "Outro imóvel",
  };

  const MAX_DOC_BYTES = 8 * 1024 * 1024;
  const MAX_PDF_TEXT = 120000;

  function validatePdfAttachment(doc, label = "Documento PDF") {
    if (doc === null || doc === undefined) return;
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw Error(label + " inválido.");
    if (!nonEmpty(doc.name, 240)) throw Error("Nome do PDF inválido.");
    if (doc.type !== "application/pdf") throw Error("Anexa apenas ficheiros PDF.");
    if (!Number.isInteger(doc.size) || doc.size <= 0 || doc.size > MAX_DOC_BYTES)
      throw Error("O PDF deve ter no máximo 8 MB.");
    const prefix = "data:application/pdf;base64,";
    if (typeof doc.data !== "string" || !doc.data.startsWith(prefix) || doc.data.length > Math.ceil((MAX_DOC_BYTES * 4) / 3) + 128)
      throw Error("Conteúdo do PDF inválido.");
    let header = "";
    try {
      const sample = doc.data.slice(prefix.length, prefix.length + 24);
      header = typeof Buffer === "function" ? Buffer.from(sample, "base64").toString("latin1") : atob(sample);
    } catch {
      throw Error("Codificação do PDF inválida.");
    }
    if (!header.startsWith("%PDF-")) throw Error("O ficheiro anexado não é um PDF válido.");
    if (doc.text !== undefined && !text(doc.text, MAX_PDF_TEXT)) throw Error("Texto extraído do PDF inválido.");
    if (doc.ocrStatus !== undefined && !["text", "ocr", "failed", "pending", "empty"].includes(doc.ocrStatus))
      throw Error("Estado de leitura do PDF inválido.");
    if (doc.pages !== undefined && (!Number.isInteger(doc.pages) || doc.pages < 0 || doc.pages > 500))
      throw Error("Número de páginas do PDF inválido.");
  }

  function validateRoutines(d) {
    const list = d.practical?.routines;
    if (list === undefined) return;
    if (!Array.isArray(list) || list.length > 300) throw Error("Lista de rotinas domésticas inválida.");
    const ids = new Set();
    const eqIds = new Set((d.practical?.equipment || []).map((e) => String(e.id)));
    for (const r of list) {
      if (
        !r ||
        typeof r !== "object" ||
        !validId(r.id) ||
        ids.has(r.id) ||
        !nonEmpty(r.title, 160) ||
        !text(r.area ?? "", 80) ||
        !Object.hasOwn(FREQUENCIES, r.frequency) ||
        !F().validDate(r.nextDate) ||
        typeof r.active !== "boolean" ||
        !text(r.notes ?? "", 1000) ||
        !Array.isArray(r.checklist) ||
        r.checklist.length > 30 ||
        !Array.isArray(r.history) ||
        r.history.length > 200
      )
        throw Error("Rotina doméstica inválida.");
      if (r.equipmentId && (!validId(r.equipmentId) || !eqIds.has(String(r.equipmentId))))
        throw Error("Equipamento associado à rotina inexistente.");
      ids.add(r.id);
      const itemIds = new Set();
      for (const item of r.checklist) {
        if (!item || !validId(item.id) || itemIds.has(item.id) || !nonEmpty(item.label, 160) || typeof item.done !== "boolean")
          throw Error("Item da checklist de rotina inválido.");
        itemIds.add(item.id);
      }
      const histIds = new Set();
      for (const h of r.history) {
        if (
          !h ||
          !validId(h.id) ||
          histIds.has(h.id) ||
          !F().validDate(h.date) ||
          !F().validDate(h.nextDate) ||
          !Number.isInteger(h.completedItems) ||
          h.completedItems < 0 ||
          !Number.isInteger(h.totalItems) ||
          h.totalItems < 0 ||
          h.completedItems > h.totalItems ||
          !Array.isArray(h.checkedLabels) ||
          h.checkedLabels.length > 30 ||
          h.checkedLabels.some((x) => !nonEmpty(x, 160)) ||
          !text(h.note ?? "", 500)
        )
          throw Error("Histórico de execução da rotina inválido.");
        histIds.add(h.id);
      }
    }
  }

  function validateUtilities(d) {
    const list = d.casa?.utilityReadings;
    if (list === undefined) return;
    if (!Array.isArray(list) || list.length > 2000) throw Error("Lista de leituras de consumos inválida.");
    const ids = new Set();
    const bySeries = new Map();
    for (const r of list) {
      if (
        !r ||
        typeof r !== "object" ||
        !validId(r.id) ||
        ids.has(r.id) ||
        !Object.hasOwn(UTILITIES, r.utility) ||
        !nonEmpty(r.meter, 80) ||
        !UTILITIES[r.utility].units.includes(r.unit) ||
        !F().validDate(r.date) ||
        !validDec3(r.reading, true) ||
        !["reading", "reset"].includes(r.kind) ||
        (r.unitPrice !== null && r.unitPrice !== undefined && (!Number.isFinite(r.unitPrice) || r.unitPrice < 0 || r.unitPrice > 1000 || round4(r.unitPrice) !== r.unitPrice)) ||
        !text(r.note ?? "", 500)
      )
        throw Error("Leitura de contador inválida.");
      ids.add(r.id);
      const key = `${r.utility}||${r.meter.trim().toLocaleLowerCase("pt-PT")}`;
      if (!bySeries.has(key)) bySeries.set(key, []);
      bySeries.get(key).push(r);
    }
    for (const rows of bySeries.values()) {
      const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "reset" ? -1 : 1));
      const seenDateKind = new Set();
      let prev = null;
      for (const curr of sorted) {
        const dk = `${curr.date}|${curr.kind}`;
        if (seenDateKind.has(dk)) throw Error("Já existe uma leitura registada nesta data para este contador.");
        seenDateKind.add(dk);
        if (prev && curr.kind === "reading") {
          if (curr.unit !== prev.unit)
            throw Error("A unidade do contador mudou sem registo de substituição/reinício.");
          if (curr.reading < prev.reading)
            throw Error("A leitura acumulada não pode ser inferior à leitura anterior sem registar mudança de contador.");
        }
        prev = curr;
      }
    }
  }

  function validateVehicles(d) {
    const list = d.practical?.vehicles;
    if (list === undefined) return;
    if (!Array.isArray(list) || list.length > 50) throw Error("Lista de veículos inválida.");
    const ids = new Set();
    const assetIds = new Set((d.assets || []).map((a) => String(a.id)));
    for (const v of list) {
      if (
        !v ||
        typeof v !== "object" ||
        !validId(v.id) ||
        ids.has(v.id) ||
        !nonEmpty(v.name, 120) ||
        !text(v.plate ?? "", 40) ||
        !text(v.makeModel ?? "", 120) ||
        (v.year !== null && v.year !== undefined && (!Number.isInteger(v.year) || v.year < 1900 || v.year > 2100)) ||
        !Object.hasOwn(VEHICLE_FUELS, v.fuelType) ||
        !text(v.assetId ?? "", 100) ||
        (v.assetId && !assetIds.has(String(v.assetId))) ||
        !validDec3(v.currentKm ?? 0, true) ||
        !optDate(v.nextInspectionDate) ||
        !optDate(v.iucDate) ||
        !optDate(v.insuranceDate) ||
        !optDate(v.nextMaintenanceDate) ||
        (v.nextMaintenanceKm !== null && v.nextMaintenanceKm !== undefined && !validDec3(v.nextMaintenanceKm, true)) ||
        !text(v.notes ?? "", 1000) ||
        !Array.isArray(v.mileageLog) ||
        v.mileageLog.length > 500 ||
        !Array.isArray(v.fuelings) ||
        v.fuelings.length > 1000 ||
        !Array.isArray(v.maintenance) ||
        v.maintenance.length > 500 ||
        !Array.isArray(v.documents) ||
        v.documents.length > 50
      )
        throw Error("Ficha do veículo inválida.");
      ids.add(v.id);
      const mIds = new Set();
      for (const m of v.mileageLog) {
        if (!m || !validId(m.id) || mIds.has(m.id) || !F().validDate(m.date) || !validDec3(m.km, true) || !text(m.note ?? "", 500))
          throw Error("Registo de quilometragem inválido.");
        mIds.add(m.id);
      }
      const fIds = new Set();
      for (const f of v.fuelings) {
        if (
          !f ||
          !validId(f.id) ||
          fIds.has(f.id) ||
          !F().validDate(f.date) ||
          !validDec3(f.km, true) ||
          !validDec3(f.quantity, false) ||
          !["L", "kWh"].includes(f.unit) ||
          !moneyOrZero(f.cost) ||
          typeof f.fullTank !== "boolean" ||
          !text(f.station ?? "", 120) ||
          !text(f.transactionId ?? "", 100) ||
          !text(f.note ?? "", 500)
        )
          throw Error("Registo de abastecimento inválido.");
        fIds.add(f.id);
      }
      const maintIds = new Set();
      for (const m of v.maintenance) {
        if (
          !m ||
          !validId(m.id) ||
          maintIds.has(m.id) ||
          !F().validDate(m.date) ||
          !Object.hasOwn(VEHICLE_MAINT_KINDS, m.kind) ||
          !nonEmpty(m.description, 240) ||
          (m.km !== null && m.km !== undefined && !validDec3(m.km, true)) ||
          !moneyOrZero(m.cost) ||
          !optDate(m.nextDate) ||
          (m.nextKm !== null && m.nextKm !== undefined && !validDec3(m.nextKm, true)) ||
          !text(m.transactionId ?? "", 100) ||
          !text(m.note ?? "", 500)
        )
          throw Error("Registo de manutenção do veículo inválido.");
        maintIds.add(m.id);
      }
      const docIds = new Set();
      for (const doc of v.documents) {
        if (
          !doc ||
          !validId(doc.id) ||
          docIds.has(doc.id) ||
          !nonEmpty(doc.title, 160) ||
          !nonEmpty(doc.category, 80) ||
          !optDate(doc.date) ||
          !optDate(doc.validUntil) ||
          !text(doc.note ?? "", 500) ||
          !doc.document
        )
          throw Error("Documento do veículo inválido.");
        validatePdfAttachment(doc.document, "Documento PDF do veículo");
        docIds.add(doc.id);
      }
    }
  }

  function validateHousing(d) {
    const list = d.practical?.housing;
    if (list === undefined) return;
    if (!Array.isArray(list) || list.length > 20) throw Error("Lista de dossiers da habitação inválida.");
    const ids = new Set();
    const assetIds = new Set((d.assets || []).map((a) => String(a.id)));
    const eqIds = new Set((d.practical?.equipment || []).map((e) => String(e.id)));
    const routineIds = new Set((d.practical?.routines || []).map((r) => String(r.id)));
    for (const h of list) {
      if (
        !h ||
        typeof h !== "object" ||
        !validId(h.id) ||
        ids.has(h.id) ||
        !nonEmpty(h.name, 120) ||
        !Object.hasOwn(HOUSING_KINDS, h.kind) ||
        !text(h.typology ?? "", 60) ||
        !text(h.addressNote ?? "", 240) ||
        !text(h.taxId ?? "", 80) ||
        !text(h.energyCertificate ?? "", 40) ||
        !optDate(h.energyValidUntil) ||
        !optDate(h.insuranceDate) ||
        !optDate(h.imiDate) ||
        !optDate(h.condominiumDate) ||
        !text(h.assetId ?? "", 100) ||
        (h.assetId && !assetIds.has(String(h.assetId))) ||
        !Array.isArray(h.equipmentIds) ||
        h.equipmentIds.length > 100 ||
        h.equipmentIds.some((id) => !validId(id) || !eqIds.has(String(id))) ||
        !Array.isArray(h.routineIds) ||
        h.routineIds.length > 100 ||
        h.routineIds.some((id) => !validId(id) || !routineIds.has(String(id))) ||
        !Array.isArray(h.transactionIds) ||
        h.transactionIds.length > 200 ||
        h.transactionIds.some((id) => !validId(String(id))) ||
        !text(h.notes ?? "", 2000) ||
        !Array.isArray(h.documents) ||
        h.documents.length > 100
      )
        throw Error("Dossier da habitação inválido.");
      ids.add(h.id);
      const docIds = new Set();
      for (const doc of h.documents) {
        if (
          !doc ||
          !validId(doc.id) ||
          docIds.has(doc.id) ||
          !nonEmpty(doc.title, 160) ||
          !nonEmpty(doc.category, 80) ||
          !optDate(doc.date) ||
          !optDate(doc.validUntil) ||
          !text(doc.equipmentId ?? "", 100) ||
          (doc.equipmentId && !eqIds.has(String(doc.equipmentId))) ||
          !text(doc.note ?? "", 500) ||
          !doc.document
        )
          throw Error("Documento da habitação inválido.");
        validatePdfAttachment(doc.document, "Documento PDF da habitação");
        docIds.add(doc.id);
      }
    }
  }

  const NOTICE_AREAS=['payments','warranties','food','routines','dossiers'];
  function noticePreferences(d){return{enabled:{payments:true,warranties:true,food:true,routines:true,dossiers:true,...d.practical?.noticePreferences?.enabled},days:{payments:30,warranties:45,food:14,routines:30,dossiers:30,...d.practical?.noticePreferences?.days},urgentDays:d.practical?.noticePreferences?.urgentDays??3};}
  function validateNoticePreferences(d){const p=d.practical?.noticePreferences;if(p===undefined)return;if(!p||typeof p!=='object'||Array.isArray(p)||!p.enabled||!p.days||NOTICE_AREAS.some(k=>typeof p.enabled[k]!=='boolean'||!Number.isInteger(p.days[k])||p.days[k]<0||p.days[k]>365)||!Number.isInteger(p.urgentDays)||p.urgentDays<0||p.urgentDays>30)throw Error('Configuração de avisos inválida.');}
  function saveNoticePreferences(d,input){const draft=clone(d);draft.practical=P().state(draft);draft.practical.noticePreferences=clone(input);validateNoticePreferences(draft);d.practical=draft.practical;}

  function validateNoticeReviews(d) {
    const list = d.practical?.noticeReviews;
    if (list === undefined) return;
    if (!Array.isArray(list) || list.length > 10000) throw Error("Lista de revisões de avisos inválida.");
    const ids = new Set();
    for (const r of list) {
      if (
        !r ||
        typeof r !== "object" ||
        !validId(r.id) ||
        ids.has(r.id) ||
        !["paid", "cancelled", "snoozed", "dismissed"].includes(r.state) ||
        (r.state === "snoozed" && !F().validDate(r.until))
      )
        throw Error("Revisão de aviso inválida.");
      ids.add(r.id);
    }
  }

  function validate(d) {
    if (!d || typeof d !== "object") return d;
    validateRoutines(d);
    validateUtilities(d);
    validateVehicles(d);
    validateHousing(d);
    validateNoticeReviews(d);
    validateNoticePreferences(d);
    if(d.practical?.entryTips!==undefined&&typeof d.practical.entryTips!=="boolean")throw Error("Preferência de dicas inválida.");
    return d;
  }

  function ensurePractical(d, field) {
    const p = P().writable(d);
    if (!Array.isArray(p[field])) p[field] = [];
    return p[field];
  }

  function ensureCasaReadings(d) {
    d.casa = clone(C().state(d));
    if (!Array.isArray(d.casa.utilityReadings)) d.casa.utilityReadings = [];
    return d.casa.utilityReadings;
  }

  function transact(d, fn) {
    const draft = clone(d);
    const out = fn(draft);
    F().normalize(draft);
    Object.assign(d, draft);
    return out;
  }

  /* ========================================================================
   * 1. CUSTO ACUMULADO DOS EQUIPAMENTOS E ROTINAS DOMÉSTICAS
   * ======================================================================== */
  function equipmentCosts(d, equipmentId) {
    const s = P().state(d);
    const e = s.equipment.find((x) => String(x.id) === String(equipmentId));
    if (!e) throw Error("Equipamento inexistente.");
    const hasPurchasePrice = e.purchasePrice !== undefined && e.purchasePrice !== null && Number.isFinite(Number(e.purchasePrice));
    const purchasePrice = hasPurchasePrice ? F().money(e.purchasePrice) : 0;
    const interventions = s.interventions.filter((i) => String(i.equipmentId) === String(e.id));
    const linkedTxIds = new Set();
    for (const i of interventions) {
      if (i.transactionId) linkedTxIds.add(String(i.transactionId));
    }
    const interventionsTotal = F().money(interventions.reduce((acc, i) => acc + F().money(i.cost || 0), 0));
    const directTransactions = (d.transactions || []).filter(
      (t) =>
        t.type === "expense" &&
        (String(t.equipmentId || "") === String(e.id) || (e.pendingId && String(t.pendingId || "") === String(e.pendingId))) &&
        !linkedTxIds.has(String(t.id)),
    );
    for (const t of directTransactions) linkedTxIds.add(String(t.id));
    const directTransactionsTotal = F().money(directTransactions.reduce((acc, t) => acc + F().money(t.amount || 0), 0));
    const effectiveMaintenanceTotal = F().money(interventionsTotal + directTransactionsTotal);
    const accumulatedTotal = F().money(purchasePrice + effectiveMaintenanceTotal);

    const pendingRow = e.pendingId ? (d.pendingPayments || []).find((p) => String(p.id) === String(e.pendingId)) : null;
    const reserveRow = e.reserveId ? (d.reserves || []).find((r) => String(r.id) === String(e.reserveId)) : null;
    const plannedFutureCost = e.planStatus === "completed" ? 0 : F().money(pendingRow ? pendingRow.amount : e.date ? e.cost || 0 : 0);
    const reservedAmount = F().money(reserveRow ? reserveRow.saved || 0 : 0);
    const planHistoryTotal = F().money((e.planHistory || []).reduce((acc, p) => acc + F().money(p.cost || 0), 0));

    return {
      equipmentId: e.id,
      name: e.name,
      hasPurchasePrice,
      purchasePrice,
      interventionsCount: interventions.length,
      interventionsTotal,
      directTransactionsCount: directTransactions.length,
      directTransactionsTotal,
      effectiveMaintenanceTotal,
      accumulatedTotal,
      plannedFutureCost,
      reservedAmount,
      planHistoryCount: (e.planHistory || []).length,
      planHistoryTotal,
      deduplicatedTransactionIds: [...linkedTxIds],
    };
  }

  function allEquipmentCosts(d) {
    const s = P().state(d);
    const items = s.equipment.map((e) => equipmentCosts(d, e.id));
    return {
      items,
      purchaseTotal: F().money(items.reduce((acc, x) => acc + x.purchasePrice, 0)),
      maintenanceTotal: F().money(items.reduce((acc, x) => acc + x.effectiveMaintenanceTotal, 0)),
      accumulatedTotal: F().money(items.reduce((acc, x) => acc + x.accumulatedTotal, 0)),
      plannedFutureTotal: F().money(items.reduce((acc, x) => acc + x.plannedFutureCost, 0)),
    };
  }

  function routines(d) {
    return d.practical?.routines || [];
  }

  function parseChecklistInput(rawChecklist, existing = []) {
    const oldByLabel = new Map((existing || []).map((i) => [i.label.trim().toLocaleLowerCase("pt-PT"), i]));
    const lines = Array.isArray(rawChecklist)
      ? rawChecklist
      : String(rawChecklist || "")
          .split(/\r?\n|;/)
          .map((s) => s.trim())
          .filter(Boolean);
    return lines.map((entry) => {
      if (entry && typeof entry === "object") {
        const label = String(entry.label || "").trim();
        if (!nonEmpty(label, 160)) throw Error("Indica uma descrição válida para cada passo da rotina.");
        return { id: entry.id || F().id(), label, done: Boolean(entry.done) };
      }
      const label = String(entry || "").trim();
      if (!nonEmpty(label, 160)) throw Error("Indica uma descrição válida para cada passo da rotina.");
      const prev = oldByLabel.get(label.toLocaleLowerCase("pt-PT"));
      return { id: prev?.id || F().id(), label, done: Boolean(prev?.done) };
    });
  }

  function saveRoutine(d, input = {}) {
    return transact(d, (draft) => {
      const list = ensurePractical(draft, "routines");
      const existing = list.find((r) => String(r.id) === String(input.id || ""));
      const title = String(input.title || "").trim();
      if (!nonEmpty(title, 160)) throw Error("Indica o nome da rotina doméstica.");
      const area = String(input.area ?? existing?.area ?? "Geral").trim() || "Geral";
      const frequency = String(input.frequency || existing?.frequency || "monthly");
      if (!Object.hasOwn(FREQUENCIES, frequency)) throw Error("Escolhe uma periodicidade válida para a rotina.");
      const nextDate = String(input.nextDate || existing?.nextDate || F().today());
      if (!F().validDate(nextDate)) throw Error("Indica a próxima data prevista da rotina.");
      const equipmentId = String(input.equipmentId ?? existing?.equipmentId ?? "").trim();
      if (equipmentId && !(draft.practical?.equipment || []).some((e) => String(e.id) === equipmentId))
        throw Error("O equipamento escolhido já não existe.");
      const checklist =
        input.checklist !== undefined
          ? parseChecklistInput(input.checklist, existing?.checklist || [])
          : clone(existing?.checklist || []);
      const row = {
        id: existing?.id || String(input.id || F().id()),
        title,
        area,
        frequency,
        nextDate,
        equipmentId,
        active: input.active === undefined ? (existing ? existing.active : true) : Boolean(input.active),
        notes: String(input.notes ?? existing?.notes ?? "").trim(),
        checklist,
        history: clone(existing?.history || []),
      };
      const idx = list.findIndex((r) => r.id === row.id);
      if (idx < 0) list.push(row);
      else list[idx] = row;
      return row;
    });
  }

  function toggleRoutineCheck(d, routineId, itemId, done) {
    return transact(d, (draft) => {
      const r = ensurePractical(draft, "routines").find((x) => String(x.id) === String(routineId));
      if (!r) throw Error("Rotina inexistente.");
      const item = r.checklist.find((x) => String(x.id) === String(itemId));
      if (!item) throw Error("Passo da checklist inexistente.");
      item.done = done === undefined ? !item.done : Boolean(done);
      return r;
    });
  }

  function completeRoutine(d, routineId, input = {}) {
    return transact(d, (draft) => {
      const r = ensurePractical(draft, "routines").find((x) => String(x.id) === String(routineId));
      if (!r) throw Error("Rotina inexistente.");
      const date = String(input.date || F().today());
      if (!F().validDate(date)) throw Error("Data de execução inválida.");
      let checkedLabels = [];
      if (Array.isArray(input.checkedIds)) {
        const set = new Set(input.checkedIds.map(String));
        checkedLabels = r.checklist.filter((i) => set.has(String(i.id))).map((i) => i.label);
      } else {
        const alreadyChecked = r.checklist.filter((i) => i.done).map((i) => i.label);
        checkedLabels = alreadyChecked.length || input.checkAll === false ? alreadyChecked : r.checklist.map((i) => i.label);
      }
      const baseDate = r.nextDate > date ? r.nextDate : date;
      const nextDate = input.nextDate ? String(input.nextDate) : FREQUENCIES[r.frequency].advance(baseDate);
      if (!F().validDate(nextDate) || nextDate <= date)
        throw Error("A próxima data da rotina deve ser posterior à data de execução.");
      const entry = {
        id: F().id(),
        date,
        nextDate,
        completedItems: checkedLabels.length,
        totalItems: r.checklist.length,
        checkedLabels,
        note: String(input.note || "").trim(),
      };
      r.history.push(entry);
      if (r.history.length > 200) r.history = r.history.slice(-200);
      r.nextDate = nextDate;
      for (const item of r.checklist) item.done = false;
      return entry;
    });
  }

  function removeRoutine(d, routineId) {
    return transact(d, (draft) => {
      const list = ensurePractical(draft, "routines");
      const idx = list.findIndex((r) => String(r.id) === String(routineId));
      if (idx < 0) throw Error("Rotina inexistente.");
      list.splice(idx, 1);
      for (const h of draft.practical?.housing || []) {
        h.routineIds = (h.routineIds || []).filter((id) => String(id) !== String(routineId));
      }
    });
  }

  /* ========================================================================
   * 2. CASA → CONSUMOS (ÁGUA, ELETRICIDADE E GÁS)
   * ======================================================================== */
  function utilityReadings(d) {
    return d.casa?.utilityReadings || [];
  }

  function saveUtilityReading(d, input = {}) {
    return transact(d, (draft) => {
      const list = ensureCasaReadings(draft);
      const existing = list.find((r) => String(r.id) === String(input.id || ""));
      const utility = String(input.utility || existing?.utility || "water");
      if (!Object.hasOwn(UTILITIES, utility)) throw Error("Escolhe água, eletricidade ou gás.");
      const meter = String(input.meter ?? existing?.meter ?? "Contador principal").trim() || "Contador principal";
      const unit = String(input.unit || existing?.unit || UTILITIES[utility].defaultUnit);
      if (!UTILITIES[utility].units.includes(unit))
        throw Error(`Unidade inválida para ${UTILITIES[utility].label}. Usa ${UTILITIES[utility].units.map((u) => UNIT_LABELS[u]).join(" ou ")}.`);
      const date = String(input.date || existing?.date || F().today());
      if (!F().validDate(date)) throw Error("Indica uma data de leitura válida.");
      const readingNum = round3(Number(String(input.reading ?? existing?.reading ?? "").replace(",", ".")));
      if (!validDec3(readingNum, true)) throw Error("Indica um valor de leitura válido (igual ou superior a zero).");
      const kind = String(input.kind || existing?.kind || "reading");
      if (!["reading", "reset"].includes(kind)) throw Error("Tipo de leitura inválido.");
      const rawPrice = input.unitPrice === undefined ? existing?.unitPrice : input.unitPrice;
      const unitPrice =
        rawPrice === "" || rawPrice === null || rawPrice === undefined
          ? null
          : round4(Number(String(rawPrice).replace(",", ".")));
      if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000))
        throw Error("Tarifa unitária opcional inválida.");
      const row = {
        id: existing?.id || String(input.id || F().id()),
        utility,
        meter,
        unit,
        date,
        reading: readingNum,
        kind,
        unitPrice,
        note: String(input.note ?? existing?.note ?? "").trim(),
      };
      const idx = list.findIndex((r) => r.id === row.id);
      if (idx < 0) list.push(row);
      else list[idx] = row;
      list.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "reset" ? -1 : 1) || a.id.localeCompare(b.id));
      validateUtilities(draft);
      return row;
    });
  }

  function removeUtilityReading(d, readingId) {
    return transact(d, (draft) => {
      const list = ensureCasaReadings(draft);
      const idx = list.findIndex((r) => String(r.id) === String(readingId));
      if (idx < 0) throw Error("Leitura inexistente.");
      list.splice(idx, 1);
      validateUtilities(draft);
    });
  }

  function utilityComparison(d, options = {}) {
    const filterUtility = options.utility || "all";
    const filterMeter = options.meter || "";
    const all = utilityReadings(d)
      .filter((r) => (filterUtility === "all" || r.utility === filterUtility) && (!filterMeter || r.meter === filterMeter))
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "reset" ? -1 : 1) || a.id.localeCompare(b.id));

    const bySeries = new Map();
    for (const r of all) {
      const key = `${r.utility}||${r.meter}`;
      if (!bySeries.has(key)) bySeries.set(key, []);
      bySeries.get(key).push(r);
    }

    const intervals = [];
    const monthlyMap = new Map();

    for (const [, series] of bySeries) {
      let prev = null;
      let prevComputed = null;
      for (const curr of series) {
        if (!prev) {
          intervals.push({
            ...curr,
            unitLabel: UNIT_LABELS[curr.unit] || curr.unit,
            utilityLabel: UTILITIES[curr.utility]?.label || curr.utility,
            previousDate: null,
            previousReading: null,
            consumption: null,
            days: null,
            dailyAverage: null,
            estimatedCost: null,
            intervalKind: "initial",
            intervalLabel: "Leitura inicial de referência",
            deltaConsumption: null,
            deltaPercent: null,
          });
          prev = curr;
          continue;
        }
        if (curr.kind === "reset") {
          intervals.push({
            ...curr,
            unitLabel: UNIT_LABELS[curr.unit] || curr.unit,
            utilityLabel: UTILITIES[curr.utility]?.label || curr.utility,
            previousDate: prev.date,
            previousReading: prev.reading,
            consumption: null,
            days: null,
            dailyAverage: null,
            estimatedCost: null,
            intervalKind: "reset",
            intervalLabel: "Mudança / reinício de contador",
            deltaConsumption: null,
            deltaPercent: null,
          });
          prev = curr;
          continue;
        }
        const consumption = round3(curr.reading - prev.reading);
        const days = Math.max(0, dayDiff(prev.date, curr.date));
        const dailyAverage = days > 0 ? round3(consumption / days) : null;
        const estimatedCost = curr.unitPrice !== null && curr.unitPrice !== undefined ? F().money(consumption * curr.unitPrice) : null;
        const intervalKind =
          days === 0
            ? "same-day"
            : days >= 25 && days <= 35
              ? "monthly"
              : days < 25
                ? "partial"
                : "extended";
        const intervalLabel =
          intervalKind === "monthly"
            ? `Mensal regular · ${days} dias`
            : intervalKind === "partial"
              ? `Intervalo parcial · ${days} dias`
              : intervalKind === "extended"
                ? `Intervalo alargado · ${days} dias (${prev.date} a ${curr.date})`
                : "Leitura no mesmo dia";
        const deltaConsumption = prevComputed ? round3(consumption - prevComputed.consumption) : null;
        const deltaPercent =
          prevComputed && prevComputed.consumption > 0
            ? Math.round(((consumption - prevComputed.consumption) / prevComputed.consumption) * 1000) / 10
            : null;
        const row = {
          ...curr,
          unitLabel: UNIT_LABELS[curr.unit] || curr.unit,
          utilityLabel: UTILITIES[curr.utility]?.label || curr.utility,
          previousDate: prev.date,
          previousReading: prev.reading,
          consumption,
          days,
          dailyAverage,
          estimatedCost,
          intervalKind,
          intervalLabel,
          deltaConsumption,
          deltaPercent,
        };
        intervals.push(row);
        prev = curr;
        prevComputed = row;

        const monthKey = `${curr.date.slice(0, 7)}||${curr.utility}||${curr.unit}`;
        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, {
            month: curr.date.slice(0, 7),
            utility: curr.utility,
            utilityLabel: UTILITIES[curr.utility]?.label || curr.utility,
            unit: curr.unit,
            unitLabel: UNIT_LABELS[curr.unit] || curr.unit,
            consumption: 0,
            days: 0,
            estimatedCost: 0,
            hasEstimatedCost: false,
            intervalsCount: 0,
            hasIncompleteIntervals: false,
          });
        }
        const m = monthlyMap.get(monthKey);
        m.consumption = round3(m.consumption + consumption);
        m.days += days;
        if (estimatedCost !== null) {
          m.estimatedCost = F().money(m.estimatedCost + estimatedCost);
          m.hasEstimatedCost = true;
        }
        m.intervalsCount += 1;
        if (intervalKind !== "monthly") m.hasIncompleteIntervals = true;
      }
    }

    const monthly = [...monthlyMap.values()].sort((a, b) => b.month.localeCompare(a.month) || a.utility.localeCompare(b.utility));
    for (let i = 0; i < monthly.length; i++) {
      const curr = monthly[i];
      const prior = monthly.slice(i + 1).find((x) => x.utility === curr.utility && x.unit === curr.unit);
      curr.previousMonth = prior?.month || null;
      curr.previousConsumption = prior ? prior.consumption : null;
      curr.deltaConsumption = prior ? round3(curr.consumption - prior.consumption) : null;
      curr.deltaPercent =
        prior && prior.consumption > 0 ? Math.round(((curr.consumption - prior.consumption) / prior.consumption) * 1000) / 10 : null;
    }

    return {
      readingsCount: all.length,
      meters: [...new Set(utilityReadings(d).map((r) => r.meter))].sort((a, b) => a.localeCompare(b, "pt-PT")),
      intervals: intervals.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
      monthly,
    };
  }

  /* ========================================================================
   * 3. FICHA DO VEÍCULO
   * ======================================================================== */
  function vehicles(d) {
    return d.practical?.vehicles || [];
  }

  function recomputeVehicleKm(v) {
    const kms = [
      v.currentKm || 0,
      ...(v.mileageLog || []).map((m) => m.km || 0),
      ...(v.fuelings || []).map((f) => f.km || 0),
      ...(v.maintenance || []).map((m) => m.km || 0),
    ];
    v.currentKm = round3(Math.max(0, ...kms));
  }

  function verifyLinkedExpense(d, transactionId, cost, currentRecordId = "") {
    const tid = String(transactionId || "").trim();
    if (!tid) return "";
    const tx = (d.transactions || []).find((t) => String(t.id) === tid);
    if (!tx || tx.type !== "expense") throw Error("Escolhe uma despesa existente para associar este registo.");
    if (F().cents(tx.amount) !== F().cents(cost))
      throw Error("O pagamento associado tem de ter o mesmo valor do registo (" + cost.toFixed(2).replace(".", ",") + " €).");
    for (const v of d.practical?.vehicles || []) {
      for (const f of v.fuelings || []) {
        if (f.id !== currentRecordId && String(f.transactionId || "") === tid)
          throw Error("Este pagamento já está associado a outro abastecimento.");
      }
      for (const m of v.maintenance || []) {
        if (m.id !== currentRecordId && String(m.transactionId || "") === tid)
          throw Error("Este pagamento já está associado a outra manutenção de veículo.");
      }
    }
    return tid;
  }

  function saveVehicle(d, input = {}) {
    return transact(d, (draft) => {
      const list = ensurePractical(draft, "vehicles");
      const existing = list.find((v) => String(v.id) === String(input.id || ""));
      const name = String(input.name || "").trim();
      if (!nonEmpty(name, 120)) throw Error("Indica o nome ou identificação do veículo.");
      const fuelType = String(input.fuelType || existing?.fuelType || "gasoline");
      if (!Object.hasOwn(VEHICLE_FUELS, fuelType)) throw Error("Tipo de combustível/energia inválido.");
      const assetId = String(input.assetId ?? existing?.assetId ?? "").trim();
      if (assetId && !(draft.assets || []).some((a) => String(a.id) === assetId))
        throw Error("O bem patrimonial selecionado já não existe.");
      const rawYear = input.year === undefined ? existing?.year : input.year;
      const year = rawYear === "" || rawYear === null || rawYear === undefined ? null : Number(rawYear);
      const rawNextKm = input.nextMaintenanceKm === undefined ? existing?.nextMaintenanceKm : input.nextMaintenanceKm;
      const nextMaintenanceKm =
        rawNextKm === "" || rawNextKm === null || rawNextKm === undefined
          ? null
          : round3(Number(String(rawNextKm).replace(",", ".")));
      const row = {
        id: existing?.id || String(input.id || F().id()),
        name,
        plate: String(input.plate ?? existing?.plate ?? "").trim(),
        makeModel: String(input.makeModel ?? existing?.makeModel ?? "").trim(),
        year,
        fuelType,
        assetId,
        currentKm: round3(Number(String(input.currentKm ?? existing?.currentKm ?? 0).replace(",", "."))),
        nextInspectionDate: String(input.nextInspectionDate ?? existing?.nextInspectionDate ?? "").trim(),
        iucDate: String(input.iucDate ?? existing?.iucDate ?? "").trim(),
        insuranceDate: String(input.insuranceDate ?? existing?.insuranceDate ?? "").trim(),
        nextMaintenanceDate: String(input.nextMaintenanceDate ?? existing?.nextMaintenanceDate ?? "").trim(),
        nextMaintenanceKm,
        notes: String(input.notes ?? existing?.notes ?? "").trim(),
        mileageLog: clone(existing?.mileageLog || []),
        fuelings: clone(existing?.fuelings || []),
        maintenance: clone(existing?.maintenance || []),
        documents: clone(existing?.documents || []),
      };
      recomputeVehicleKm(row);
      const idx = list.findIndex((v) => v.id === row.id);
      if (idx < 0) list.push(row);
      else list[idx] = row;
      return row;
    });
  }

  function removeVehicle(d, vehicleId) {
    return transact(d, (draft) => {
      const list = ensurePractical(draft, "vehicles");
      const idx = list.findIndex((v) => String(v.id) === String(vehicleId));
      if (idx < 0) throw Error("Veículo inexistente.");
      list.splice(idx, 1);
    });
  }

  function addVehicleMileage(d, vehicleId, input = {}) {
    return transact(d, (draft) => {
      const v = ensurePractical(draft, "vehicles").find((x) => String(x.id) === String(vehicleId));
      if (!v) throw Error("Veículo inexistente.");
      const date = String(input.date || F().today());
      if (!F().validDate(date)) throw Error("Data de quilometragem inválida.");
      const km = round3(Number(String(input.km ?? "").replace(",", ".")));
      if (!validDec3(km, true)) throw Error("Indica uma quilometragem válida.");
      const lowerAfter = v.mileageLog.find((m) => m.date <= date && m.km > km);
      if (lowerAfter)
        throw Error(`A quilometragem (${km} km) não pode ser inferior ao registo de ${lowerAfter.date} (${lowerAfter.km} km).`);
      const higherBefore = v.mileageLog.find((m) => m.date >= date && m.km < km);
      if (higherBefore)
        throw Error(`A quilometragem (${km} km) excede o registo posterior de ${higherBefore.date} (${higherBefore.km} km).`);
      const entry = {
        id: String(input.id || F().id()),
        date,
        km,
        note: String(input.note || "").trim(),
      };
      v.mileageLog.push(entry);
      v.mileageLog.sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
      recomputeVehicleKm(v);
      return entry;
    });
  }

  function addVehicleFueling(d, vehicleId, input = {}) {
    return transact(d, (draft) => {
      const v = ensurePractical(draft, "vehicles").find((x) => String(x.id) === String(vehicleId));
      if (!v) throw Error("Veículo inexistente.");
      const date = String(input.date || F().today());
      if (!F().validDate(date)) throw Error("Data de abastecimento inválida.");
      const km = round3(Number(String(input.km ?? v.currentKm ?? 0).replace(",", ".")));
      const quantity = round3(Number(String(input.quantity ?? "").replace(",", ".")));
      if (!validDec3(quantity, false)) throw Error("Indica a quantidade abastecida (litros ou kWh).");
      const unit = String(input.unit || (v.fuelType === "electric" ? "kWh" : "L"));
      const cost = F().money(Number(String(input.cost ?? 0).replace(",", ".")));
      if (!moneyOrZero(cost)) throw Error("Indica um custo válido para o abastecimento.");
      const entryId = String(input.id || F().id());
      const transactionId = verifyLinkedExpense(draft, input.transactionId, cost, entryId);
      const entry = {
        id: entryId,
        date,
        km,
        quantity,
        unit,
        cost,
        fullTank: input.fullTank !== false,
        station: String(input.station || "").trim(),
        transactionId,
        note: String(input.note || "").trim(),
      };
      v.fuelings.push(entry);
      v.fuelings.sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
      recomputeVehicleKm(v);
      return entry;
    });
  }

  function addVehicleMaintenance(d, vehicleId, input = {}) {
    return transact(d, (draft) => {
      const v = ensurePractical(draft, "vehicles").find((x) => String(x.id) === String(vehicleId));
      if (!v) throw Error("Veículo inexistente.");
      const date = String(input.date || F().today());
      if (!F().validDate(date)) throw Error("Data da manutenção inválida.");
      const kind = String(input.kind || "revision");
      if (!Object.hasOwn(VEHICLE_MAINT_KINDS, kind)) throw Error("Tipo de manutenção inválido.");
      const description = String(input.description || VEHICLE_MAINT_KINDS[kind] || "").trim();
      if (!nonEmpty(description, 240)) throw Error("Indica a descrição da manutenção.");
      const rawKm = input.km;
      const km = rawKm === "" || rawKm === null || rawKm === undefined ? v.currentKm : round3(Number(String(rawKm).replace(",", ".")));
      const cost = F().money(Number(String(input.cost ?? 0).replace(",", ".")));
      if (!moneyOrZero(cost)) throw Error("Custo da manutenção inválido.");
      const nextDate = String(input.nextDate || "").trim();
      const rawNextKm = input.nextKm;
      const nextKm =
        rawNextKm === "" || rawNextKm === null || rawNextKm === undefined
          ? null
          : round3(Number(String(rawNextKm).replace(",", ".")));
      const entryId = String(input.id || F().id());
      const transactionId = verifyLinkedExpense(draft, input.transactionId, cost, entryId);
      const entry = {
        id: entryId,
        date,
        kind,
        description,
        km,
        cost,
        nextDate,
        nextKm,
        transactionId,
        note: String(input.note || "").trim(),
      };
      v.maintenance.push(entry);
      v.maintenance.sort((a, b) => a.date.localeCompare(b.date));
      if (nextDate && (!v.nextMaintenanceDate || nextDate > v.nextMaintenanceDate)) {
        if (kind === "inspection") v.nextInspectionDate = nextDate;
        else if (kind === "iuc") v.iucDate = nextDate;
        else if (kind === "insurance") v.insuranceDate = nextDate;
        else v.nextMaintenanceDate = nextDate;
      }
      if (nextKm !== null && (v.nextMaintenanceKm === null || nextKm > v.nextMaintenanceKm)) {
        v.nextMaintenanceKm = nextKm;
      }
      recomputeVehicleKm(v);
      return entry;
    });
  }

  function addVehicleDocument(d, vehicleId, input = {}) {
    return transact(d, (draft) => {
      const v = ensurePractical(draft, "vehicles").find((x) => String(x.id) === String(vehicleId));
      if (!v) throw Error("Veículo inexistente.");
      if (!input.document) throw Error("Escolhe um ficheiro PDF para anexar ao veículo.");
      validatePdfAttachment(input.document, "Documento PDF do veículo");
      const entry = {
        id: String(input.id || F().id()),
        title: String(input.title || input.document.name || "Documento").trim(),
        category: String(input.category || "Outro").trim(),
        date: String(input.date || F().today()).trim(),
        validUntil: String(input.validUntil || "").trim(),
        note: String(input.note || "").trim(),
        document: clone(input.document),
      };
      v.documents.push(entry);
      return entry;
    });
  }

  function removeVehicleSubrecord(d, vehicleId, listName, itemId) {
    if (!["mileageLog", "fuelings", "maintenance", "documents"].includes(listName))
      throw Error("Lista do veículo inválida.");
    return transact(d, (draft) => {
      const v = ensurePractical(draft, "vehicles").find((x) => String(x.id) === String(vehicleId));
      if (!v) throw Error("Veículo inexistente.");
      const idx = v[listName].findIndex((x) => String(x.id) === String(itemId));
      if (idx < 0) throw Error("Registo do veículo inexistente.");
      v[listName].splice(idx, 1);
      recomputeVehicleKm(v);
    });
  }

  function vehicleSummary(d, vehicleId) {
    const v = vehicles(d).find((x) => String(x.id) === String(vehicleId));
    if (!v) throw Error("Veículo inexistente.");
    const txById = new Map((d.transactions || []).map((t) => [String(t.id), t]));
    const countedTxIds = new Set();
    const diagnostics = [];

    let fuelCost = 0;
    let linkedCost = 0;
    let unlinkedCost = 0;

    for (const f of v.fuelings) {
      const c = F().money(f.cost || 0);
      fuelCost = F().money(fuelCost + c);
      if (f.transactionId) {
        countedTxIds.add(String(f.transactionId));
        linkedCost = F().money(linkedCost + c);
        const tx = txById.get(String(f.transactionId));
        if (!tx) diagnostics.push(`Abastecimento de ${f.date}: o movimento financeiro associado foi removido.`);
        else if (F().cents(tx.amount) !== F().cents(c))
          diagnostics.push(`Abastecimento de ${f.date}: o valor do movimento (${tx.amount} €) difere do abastecimento (${c} €).`);
      } else {
        unlinkedCost = F().money(unlinkedCost + c);
      }
    }

    let maintenanceCost = 0;
    for (const m of v.maintenance) {
      const c = F().money(m.cost || 0);
      const alreadyCounted = m.transactionId && countedTxIds.has(String(m.transactionId));
      if (!alreadyCounted) {
        maintenanceCost = F().money(maintenanceCost + c);
        if (m.transactionId) {
          countedTxIds.add(String(m.transactionId));
          linkedCost = F().money(linkedCost + c);
        } else {
          unlinkedCost = F().money(unlinkedCost + c);
        }
      }
      if (m.transactionId) {
        const tx = txById.get(String(m.transactionId));
        if (!tx) diagnostics.push(`Manutenção «${m.description}» (${m.date}): o movimento associado foi removido.`);
        else if (F().cents(tx.amount) !== F().cents(c))
          diagnostics.push(`Manutenção «${m.description}» (${m.date}): o valor do movimento (${tx.amount} €) difere do registo (${c} €).`);
      }
    }

    const totalEffectiveCost = F().money(fuelCost + maintenanceCost);
    const allKms = [
      ...v.mileageLog.map((m) => m.km),
      ...v.fuelings.map((f) => f.km),
      ...v.maintenance.filter((m) => m.km !== null && m.km !== undefined).map((m) => m.km),
    ].filter((k) => Number.isFinite(k) && k > 0);
    const minKm = allKms.length ? Math.min(...allKms) : v.currentKm;
    const maxKm = allKms.length ? Math.max(v.currentKm, ...allKms) : v.currentKm;
    const trackedDistanceKm = allKms.length >= 2 ? round3(maxKm - minKm) : 0;

    let averageConsumptionPer100Km = null;
    if (v.fuelings.length >= 2) {
      const sortedF = v.fuelings.slice().sort((a, b) => a.km - b.km || a.date.localeCompare(b.date));
      const dist = sortedF.at(-1).km - sortedF[0].km;
      if (dist > 0) {
        const totalQty = sortedF.slice(1).reduce((acc, f) => acc + f.quantity, 0);
        averageConsumptionPer100Km = round3((totalQty / dist) * 100);
      }
    }

    const asset = v.assetId ? (d.assets || []).find((a) => String(a.id) === String(v.assetId)) : null;
    const assetValue = asset && root.LifeFinance?.assetValue ? root.LifeFinance.assetValue(asset) : 0;

    return {
      vehicleId: v.id,
      name: v.name,
      currentKm: maxKm,
      trackedDistanceKm,
      fuelCost,
      maintenanceCost,
      totalEffectiveCost,
      linkedCost,
      unlinkedCost,
      averageConsumptionPer100Km,
      consumptionUnit: v.fuelType === "electric" ? "kWh/100 km" : "L/100 km",
      assetName: asset?.name || "",
      assetValue,
      diagnostics,
      deduplicatedTransactionIds: [...countedTxIds],
    };
  }

  /* ========================================================================
   * 4. DOSSIER DA HABITAÇÃO
   * ======================================================================== */
  function housing(d) {
    return d.practical?.housing || [];
  }

  function saveHousing(d, input = {}) {
    return transact(d, (draft) => {
      const list = ensurePractical(draft, "housing");
      const existing = list.find((h) => String(h.id) === String(input.id || ""));
      const name = String(input.name || "").trim();
      if (!nonEmpty(name, 120)) throw Error("Indica o nome do dossier da habitação.");
      const kind = String(input.kind || existing?.kind || "own");
      if (!Object.hasOwn(HOUSING_KINDS, kind)) throw Error("Tipo de habitação inválido.");
      const assetId = String(input.assetId ?? existing?.assetId ?? "").trim();
      if (assetId && !(draft.assets || []).some((a) => String(a.id) === assetId))
        throw Error("O imóvel selecionado em Património já não existe.");
      const eqSet = new Set((draft.practical?.equipment || []).map((e) => String(e.id)));
      const rtSet = new Set((draft.practical?.routines || []).map((r) => String(r.id)));
      const txSet = new Set((draft.transactions || []).map((t) => String(t.id)));
      const equipmentIds = [
        ...new Set(
          (Array.isArray(input.equipmentIds) ? input.equipmentIds : existing?.equipmentIds || [])
            .map(String)
            .filter((id) => eqSet.has(id)),
        ),
      ];
      const routineIds = [
        ...new Set(
          (Array.isArray(input.routineIds) ? input.routineIds : existing?.routineIds || [])
            .map(String)
            .filter((id) => rtSet.has(id)),
        ),
      ];
      const transactionIds = [
        ...new Set(
          (Array.isArray(input.transactionIds) ? input.transactionIds : existing?.transactionIds || [])
            .map(String)
            .filter((id) => txSet.has(id)),
        ),
      ];
      const row = {
        id: existing?.id || String(input.id || F().id()),
        name,
        kind,
        typology: String(input.typology ?? existing?.typology ?? "").trim(),
        addressNote: String(input.addressNote ?? existing?.addressNote ?? "").trim(),
        taxId: String(input.taxId ?? existing?.taxId ?? "").trim(),
        energyCertificate: String(input.energyCertificate ?? existing?.energyCertificate ?? "").trim(),
        energyValidUntil: String(input.energyValidUntil ?? existing?.energyValidUntil ?? "").trim(),
        insuranceDate: String(input.insuranceDate ?? existing?.insuranceDate ?? "").trim(),
        imiDate: String(input.imiDate ?? existing?.imiDate ?? "").trim(),
        condominiumDate: String(input.condominiumDate ?? existing?.condominiumDate ?? "").trim(),
        assetId,
        equipmentIds,
        routineIds,
        transactionIds,
        notes: String(input.notes ?? existing?.notes ?? "").trim(),
        documents: clone(existing?.documents || []),
      };
      const idx = list.findIndex((h) => h.id === row.id);
      if (idx < 0) list.push(row);
      else list[idx] = row;
      return row;
    });
  }

  function removeHousing(d, housingId) {
    return transact(d, (draft) => {
      const list = ensurePractical(draft, "housing");
      const idx = list.findIndex((h) => String(h.id) === String(housingId));
      if (idx < 0) throw Error("Dossier da habitação inexistente.");
      list.splice(idx, 1);
    });
  }

  function addHousingDocument(d, housingId, input = {}) {
    return transact(d, (draft) => {
      const h = ensurePractical(draft, "housing").find((x) => String(x.id) === String(housingId));
      if (!h) throw Error("Dossier da habitação inexistente.");
      if (!input.document) throw Error("Escolhe um ficheiro PDF para anexar ao dossier da habitação.");
      validatePdfAttachment(input.document, "Documento PDF da habitação");
      const equipmentId = String(input.equipmentId || "").trim();
      if (equipmentId && !(draft.practical?.equipment || []).some((e) => String(e.id) === equipmentId))
        throw Error("O equipamento associado ao documento já não existe.");
      const entry = {
        id: String(input.id || F().id()),
        title: String(input.title || input.document.name || "Documento").trim(),
        category: String(input.category || "Outro").trim(),
        date: String(input.date || F().today()).trim(),
        validUntil: String(input.validUntil || "").trim(),
        equipmentId,
        note: String(input.note || "").trim(),
        document: clone(input.document),
      };
      h.documents.push(entry);
      if (equipmentId && !h.equipmentIds.includes(equipmentId)) h.equipmentIds.push(equipmentId);
      return entry;
    });
  }

  function removeHousingDocument(d, housingId, docId) {
    return transact(d, (draft) => {
      const h = ensurePractical(draft, "housing").find((x) => String(x.id) === String(housingId));
      if (!h) throw Error("Dossier da habitação inexistente.");
      const idx = h.documents.findIndex((x) => String(x.id) === String(docId));
      if (idx < 0) throw Error("Documento da habitação inexistente.");
      h.documents.splice(idx, 1);
    });
  }

  function housingSummary(d, housingId) {
    const h = housing(d).find((x) => String(x.id) === String(housingId));
    if (!h) throw Error("Dossier da habitação inexistente.");
    const asset = h.assetId ? (d.assets || []).find((a) => String(a.id) === String(h.assetId)) : null;
    const assetValue = asset && root.LifeFinance?.assetValue ? root.LifeFinance.assetValue(asset) : 0;

    const eqSummaries = h.equipmentIds
      .map((id) => ((d.practical?.equipment || []).some((e) => String(e.id) === String(id)) ? equipmentCosts(d, id) : null))
      .filter(Boolean);
    const countedTxIds = new Set(eqSummaries.flatMap((s) => s.deduplicatedTransactionIds));
    const equipmentTotal = F().money(eqSummaries.reduce((acc, s) => acc + s.accumulatedTotal, 0));

    const linkedTransactions = [];
    let directExpensesTotal = 0;
    for (const tid of h.transactionIds) {
      const tx = (d.transactions || []).find((t) => String(t.id) === String(tid));
      if (!tx) continue;
      const alreadyInEquipment = countedTxIds.has(String(tx.id));
      linkedTransactions.push({ ...tx, deduplicatedWithEquipment: alreadyInEquipment });
      if (tx.type === "expense" && !alreadyInEquipment) {
        countedTxIds.add(String(tx.id));
        directExpensesTotal = F().money(directExpensesTotal + F().money(tx.amount || 0));
      }
    }

    const linkedRoutines = (d.practical?.routines || []).filter(
      (r) => h.routineIds.includes(String(r.id)) || (r.equipmentId && h.equipmentIds.includes(String(r.equipmentId))),
    );

    return {
      housingId: h.id,
      name: h.name,
      kindLabel: HOUSING_KINDS[h.kind] || h.kind,
      assetName: asset?.name || "",
      assetValue,
      equipmentCount: eqSummaries.length,
      equipmentTotal,
      directExpensesTotal,
      accumulatedTotal: F().money(equipmentTotal + directExpensesTotal),
      routinesCount: linkedRoutines.length,
      documentsCount: h.documents.length,
      linkedTransactions,
      linkedRoutines,
      equipmentSummaries: eqSummaries,
    };
  }

  /* ========================================================================
   * 5. PESQUISA NO CONTEÚDO DOS PDFS
   * ======================================================================== */
  function pdfCatalog(d) {
    const docs = [];
    for (const t of d.transactions || []) {
      const isPdf = t.attachment?.type === "application/pdf" || /\.pdf$/i.test(t.attachment?.name || "");
      const bodyText = [
        t.receiptText || "",
        ...(t.receiptItems || []).map((i) => `${i.name || ""} ${i.sourceName || ""} ${i.price ?? ""}`),
      ]
        .filter(Boolean)
        .join("\n")
        .trim();
      if (!isPdf && !bodyText) continue;
      docs.push({
        id: "tx-pdf:" + t.id,
        sourceKind: "transaction",
        sourceLabel: "Movimento",
        ownerId: String(t.id),
        docId: String(t.id),
        title: t.description || "Movimento",
        fileName: t.attachment?.name || "Comprovativo / fatura",
        date: t.date || "",
        amount: t.amount ?? null,
        text: bodyText,
        ocrStatus: t.receiptOcrStatus || (bodyText ? "text" : "empty"),
        hasBinaryPdf: Boolean(t.attachment?.data && isPdf),
        attachment: t.attachment || null,
        targetView: "transactions",
      });
    }
    for (const p of d.casa?.purchases || []) {
      const bodyText = [
        p.receiptText || "",
        ...(p.items || []).map((i) => `${i.name || ""} ${i.sourceName || ""} ${i.total ?? ""}`),
      ]
        .filter(Boolean)
        .join("\n")
        .trim();
      if (!bodyText) continue;
      docs.push({
        id: "casa-pdf:" + p.id,
        sourceKind: "casa",
        sourceLabel: "Compra Casa",
        ownerId: String(p.id),
        docId: String(p.id),
        title: p.store || "Compra Casa",
        fileName: "Fatura / talão Casa",
        date: p.date || "",
        amount: p.total ?? null,
        text: bodyText,
        ocrStatus: "text",
        hasBinaryPdf: false,
        attachment: null,
        targetView: "casaPurchases",
      });
    }
    for (const e of d.practical?.equipment || []) {
      if (!e.document) continue;
      const bodyText = String(e.document.text || "").trim();
      docs.push({
        id: "eq-pdf:" + e.id,
        sourceKind: "equipment",
        sourceLabel: "Equipamento",
        ownerId: String(e.id),
        docId: String(e.id),
        title: e.name,
        fileName: e.document.name,
        date: e.purchaseDate || e.warranty || e.date || "",
        amount: e.purchasePrice ?? null,
        text: bodyText,
        ocrStatus: e.document.ocrStatus || (bodyText ? "text" : "empty"),
        hasBinaryPdf: Boolean(e.document.data),
        attachment: e.document,
        targetView: "casaEquipment",
      });
    }
    for (const v of d.practical?.vehicles || []) {
      for (const doc of v.documents || []) {
        const bodyText = [doc.note || "", doc.document?.text || ""].filter(Boolean).join("\n").trim();
        docs.push({
          id: `veh-pdf:${v.id}:${doc.id}`,
          sourceKind: "vehicle",
          sourceLabel: "Veículo",
          ownerId: String(v.id),
          docId: String(doc.id),
          title: `${v.name} · ${doc.title}`,
          fileName: doc.document.name,
          date: doc.date || doc.validUntil || "",
          amount: null,
          text: bodyText,
          ocrStatus: doc.document.ocrStatus || (bodyText ? "text" : "empty"),
          hasBinaryPdf: Boolean(doc.document.data),
          attachment: doc.document,
          targetView: "casaVehicles",
        });
      }
    }
    for (const h of d.practical?.housing || []) {
      for (const doc of h.documents || []) {
        const bodyText = [doc.note || "", doc.document?.text || ""].filter(Boolean).join("\n").trim();
        docs.push({
          id: `house-pdf:${h.id}:${doc.id}`,
          sourceKind: "housing",
          sourceLabel: "Habitação",
          ownerId: String(h.id),
          docId: String(doc.id),
          title: `${h.name} · ${doc.title}`,
          fileName: doc.document.name,
          date: doc.date || doc.validUntil || "",
          amount: null,
          text: bodyText,
          ocrStatus: doc.document.ocrStatus || (bodyText ? "text" : "empty"),
          hasBinaryPdf: Boolean(doc.document.data),
          attachment: doc.document,
          targetView: "casaHousing",
        });
      }
    }
    return docs.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || a.title.localeCompare(b.title, "pt-PT"));
  }

  function buildExcerpt(rawText, tokens) {
    const clean = String(rawText || "").replace(/\s+/g, " ").trim();
    if (!clean) return "Sem texto extraído disponível para pré-visualização.";
    const folded = fold(clean);
    let pos = -1;
    for (const t of tokens) {
      if (!t) continue;
      const idx = folded.indexOf(t);
      if (idx >= 0 && (pos < 0 || idx < pos)) pos = idx;
    }
    if (pos < 0) return clean.slice(0, 160) + (clean.length > 160 ? "…" : "");
    const start = Math.max(0, pos - 50);
    const end = Math.min(clean.length, pos + 110);
    return (start > 0 ? "…" : "") + clean.slice(start, end) + (end < clean.length ? "…" : "");
  }

  function searchPdfs(d, query = "", options = {}) {
    const sourceFilter = options.sourceKind || "all";
    const q = fold(query);
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    const catalog = pdfCatalog(d).filter((doc) => sourceFilter === "all" || doc.sourceKind === sourceFilter);
    if (!tokens.length) {
      return catalog.map((doc) => ({
        ...doc,
        excerpt: buildExcerpt(doc.text || `${doc.title} · ${doc.fileName}`, []),
        matchedInContent: Boolean(doc.text),
      }));
    }
    const results = [];
    for (const doc of catalog) {
      const hayTitle = fold(`${doc.title} ${doc.fileName} ${doc.sourceLabel}`);
      const hayText = fold(doc.text);
      const combined = `${hayTitle} ${hayText}`;
      if (!tokens.every((tok) => combined.includes(tok))) continue;
      const matchedInContent = tokens.some((tok) => hayText.includes(tok));
      results.push({
        ...doc,
        matchedInContent,
        excerpt: buildExcerpt(matchedInContent ? doc.text : `${doc.title} · ${doc.fileName} · ${doc.text}`, tokens),
      });
    }
    return results;
  }

  function updatePdfText(d, target = {}, extractedText = "", ocrStatus = "text") {
    return transact(d, (draft) => {
      const cleanText = String(extractedText || "").slice(0, MAX_PDF_TEXT);
      const status = ["text", "ocr", "failed", "pending", "empty"].includes(ocrStatus) ? ocrStatus : "text";
      const kind = String(target.sourceKind || "");
      if (kind === "equipment") {
        const eq = (draft.practical?.equipment || []).find((e) => String(e.id) === String(target.ownerId));
        if (!eq?.document) throw Error("Documento do equipamento inexistente.");
        const beforeData = eq.document.data;
        if (status !== "failed" || !eq.document.text) eq.document.text = cleanText;
        eq.document.ocrStatus = status;
        if (eq.document.data !== beforeData) throw Error("O ficheiro PDF original não pode ser alterado.");
        return eq.document;
      }
      if (kind === "vehicle") {
        const v = (draft.practical?.vehicles || []).find((x) => String(x.id) === String(target.ownerId));
        const doc = v?.documents?.find((x) => String(x.id) === String(target.docId));
        if (!doc?.document) throw Error("Documento do veículo inexistente.");
        const beforeData = doc.document.data;
        if (status !== "failed" || !doc.document.text) doc.document.text = cleanText;
        doc.document.ocrStatus = status;
        if (doc.document.data !== beforeData) throw Error("O ficheiro PDF original não pode ser alterado.");
        return doc.document;
      }
      if (kind === "housing") {
        const h = (draft.practical?.housing || []).find((x) => String(x.id) === String(target.ownerId));
        const doc = h?.documents?.find((x) => String(x.id) === String(target.docId));
        if (!doc?.document) throw Error("Documento da habitação inexistente.");
        const beforeData = doc.document.data;
        if (status !== "failed" || !doc.document.text) doc.document.text = cleanText;
        doc.document.ocrStatus = status;
        if (doc.document.data !== beforeData) throw Error("O ficheiro PDF original não pode ser alterado.");
        return doc.document;
      }
      if (kind === "transaction") {
        const tx = (draft.transactions || []).find((t) => String(t.id) === String(target.ownerId));
        if (!tx) throw Error("Movimento inexistente.");
        if (status !== "failed" || !tx.receiptText) tx.receiptText = cleanText.slice(0, 12000);
        tx.receiptOcrStatus = status;
        return tx;
      }
      throw Error("Origem do documento PDF desconhecida.");
    });
  }

  /* ========================================================================
   * 6. CENTRO DE AVISOS GERAL
   * ======================================================================== */
  function notices(d, options = {}) {
    const today = options.today && F().validDate(options.today) ? options.today : F().today();
    const preferences=noticePreferences(d);
    const horizonDays = Number.isInteger(options.horizonDays) ? Math.min(365,Math.max(0,options.horizonDays)) : Math.max(...NOTICE_AREAS.map(k=>preferences.days[k]));
    const raw = [];
    const seenIds = new Set();
    const pushNotice = (item) => {
      if (!item || !item.id || seenIds.has(item.id)) return;
      if(!preferences.enabled[item.area])return;
      if(F().validDate(item.date)&&dayDiff(today,item.date)>(Number.isInteger(options.horizonDays)?options.horizonDays:preferences.days[item.area]))return;
      if(item.naturalState!=="paid"&&item.naturalState!=="cancelled"&&F().validDate(item.date)&&dayDiff(today,item.date)>=0)item.priority=dayDiff(today,item.date)<=preferences.urgentDays?"high":"medium";
      seenIds.add(item.id);
      raw.push(item);
    };

    // 1. Pagamentos agendados (pendingPayments) e compromissos já liquidados
    const activePendingIds = new Set();
    for (const p of d.pendingPayments || []) {
      activePendingIds.add(String(p.id));
      const days = dayDiff(today, p.date);
      if (days <= horizonDays) {
        pushNotice({
          id: `pending:${p.id}`,
          area: "payments",
          areaLabel: "Pagamentos e renovações",
          originKind: "pendingPayment",
          originId: String(p.id),
          title: p.description || "Compromisso agendado",
          date: p.date,
          amount: F().money(p.amount || 0),
          priority: days < 0 ? "high" : days <= 7 ? "medium" : "low",
          naturalState: days < 0 ? "overdue" : "upcoming",
          detail:
            (days < 0 ? `Vencido há ${Math.abs(days)} dia(s)` : days === 0 ? "Vence hoje" : `Vence em ${days} dia(s)`) +
            (p.account ? ` · ${p.account}` : ""),
          targetView: "planner",
        });
      }
    }
    for (const t of d.transactions || []) {
      if (t.pendingId && !activePendingIds.has(String(t.pendingId))) {
        pushNotice({
          id: `pending:${t.pendingId}`,
          area: "payments",
          areaLabel: "Pagamentos e renovações",
          originKind: "pendingPayment",
          originId: String(t.pendingId),
          title: t.description || "Compromisso liquidado",
          date: t.originalDueDate || t.date,
          amount: F().money(t.amount || 0),
          priority: "low",
          naturalState: "paid",
          detail: `Liquidado em ${t.date} · ${t.account || ""}`,
          targetView: "transactions",
        });
      }
    }

    // 2. Recorrências (recurring), Subscrições, Prestações, Créditos e Custos Sazonais (via Agenda/Planeamento)
    const monthsToCheck=Array.from({length:Math.ceil(horizonDays/28)+3},(_,i)=>addMonths(today.slice(0,7)+'-01',i-1).slice(0,7));
    for (const r of d.recurring || []) {
      if (r.active === false) {
        pushNotice({
          id: `recurring:${r.id}`,
          area: "payments",
          areaLabel: "Pagamentos e renovações",
          originKind: "recurring",
          originId: String(r.id),
          title: `Recorrência inativa · ${r.description}`,
          date: r.start || today,
          amount: F().money(r.amount || 0),
          priority: "low",
          naturalState: "cancelled",
          detail: "Regra desativada",
          targetView: "planner",
        });
      }
    }
    const seenScheduleNoticeIds = new Set();
    for (const m of monthsToCheck) {
      const occs = typeof F().upcoming === "function" ? F().upcoming(d, m, { includeCompleted: true }) : [];
      for (const occ of occs) {
        if (!occ || !F().validDate(occ.date)) continue;
        if (occ.subscriptionId || occ.source === "subscription") {
          const noticeId = `subscription:${occ.subscriptionId}:${occ.date}`;
          if (seenScheduleNoticeIds.has(noticeId)) continue;
          seenScheduleNoticeIds.add(noticeId);
          if (occ.agendaCompleted || occ.completed) {
            pushNotice({
              id: noticeId,
              area: "payments",
              areaLabel: "Pagamentos e renovações",
              originKind: "subscription",
              originId: String(occ.subscriptionId),
              title: `Subscrição · ${occ.description}`,
              date: occ.date,
              amount: F().money(occ.amount || 0),
              priority: "low",
              naturalState: "paid",
              detail: `Cobrança registada em ${occ.actualDate || occ.completedDate || occ.date}`,
              targetView: "planner",
            });
            continue;
          }
          const days = dayDiff(today, occ.date);
          if (days >= -45 && days <= Math.max(horizonDays, 21)) {
            const isTrial = occ.status === "trial";
            pushNotice({
              id: noticeId,
              area: "payments",
              areaLabel: "Pagamentos e renovações",
              originKind: "subscription",
              originId: String(occ.subscriptionId),
              title: `${isTrial ? "Fim de período experimental" : "Renovação de subscrição"} · ${occ.description}`,
              date: occ.date,
              amount: F().money(occ.amount || 0),
              priority: days < 0 || (isTrial && days <= 5) ? "high" : days <= 7 ? "medium" : "low",
              naturalState: days < 0 ? "overdue" : "upcoming",
              detail: days < 0 ? `Data de renovação ultrapassada (${Math.abs(days)} dia(s))` : days === 0 ? "Renova hoje" : `Renova em ${days} dia(s)`,
              targetView: "planner",
            });
          }
        } else if (occ.ruleId || occ.source === "recurring") {
          if (occ.type === "income") continue;
          const rId = occ.ruleId || occ.id;
          const noticeId = `recurring:${rId}:${occ.date}`;
          if (seenScheduleNoticeIds.has(noticeId)) continue;
          seenScheduleNoticeIds.add(noticeId);
          if (occ.agendaCompleted || occ.completed) {
            pushNotice({
              id: noticeId,
              area: "payments",
              areaLabel: "Pagamentos e renovações",
              originKind: "recurring",
              originId: String(rId),
              title: `Recorrência · ${occ.description}`,
              date: occ.date,
              amount: F().money(occ.amount || 0),
              priority: "low",
              naturalState: "paid",
              detail: `Registada em ${occ.actualDate || occ.completedDate || occ.date}`,
              targetView: "planner",
            });
            continue;
          }
          const days = dayDiff(today, occ.date);
          if (days >= -45 && days <= horizonDays) {
            pushNotice({
              id: noticeId,
              area: "payments",
              areaLabel: "Pagamentos e renovações",
              originKind: "recurring",
              originId: String(rId),
              title: `Recorrência · ${occ.description}`,
              date: occ.date,
              amount: F().money(occ.amount || 0),
              priority: days < 0 ? "high" : days <= 7 ? "medium" : "low",
              naturalState: days < 0 ? "overdue" : "upcoming",
              detail:
                (days < 0 ? `Prevista há ${Math.abs(days)} dia(s)` : days === 0 ? "Prevista para hoje" : `Prevista em ${days} dia(s)`) +
                (occ.account ? ` · ${occ.account}` : "") +
                (occ.estimated ? " · Valor estimado" : ""),
              targetView: "planner",
            });
          }
        }
      }
    }

    // 3. Subscrições e renovações diretas (subscriptions)
    for (const s of d.subscriptions || []) {
      if (s.status === "cancelled") {
        pushNotice({
          id: `subscription:${s.id}`,
          area: "payments",
          areaLabel: "Pagamentos e renovações",
          originKind: "subscription",
          originId: String(s.id),
          title: `Subscrição cancelada · ${s.name}`,
          date: s.nextDate || today,
          amount: F().money(s.amount || 0),
          priority: "low",
          naturalState: "cancelled",
          detail: "Subscrição cancelada",
          targetView: "planner",
        });
        continue;
      }
      if (!F().validDate(s.nextDate)) continue;
      const noticeId = `subscription:${s.id}:${s.nextDate}`;
      if (seenScheduleNoticeIds.has(noticeId)) continue;
      seenScheduleNoticeIds.add(noticeId);
      const paidTx = (d.transactions || []).find(
        (t) =>
          String(t.subscriptionId || t.subscriptionRuleId || "") === String(s.id) &&
          (t.recurringDate === s.nextDate || t.scheduledDate === s.nextDate || t.date === s.nextDate),
      );
      if (paidTx) {
        pushNotice({
          id: noticeId,
          area: "payments",
          areaLabel: "Pagamentos e renovações",
          originKind: "subscription",
          originId: String(s.id),
          title: `Subscrição · ${s.name}`,
          date: s.nextDate,
          amount: F().money(s.amount || 0),
          priority: "low",
          naturalState: "paid",
          detail: `Cobrança registada em ${paidTx.date}`,
          targetView: "planner",
        });
        continue;
      }
      const days = dayDiff(today, s.nextDate);
      if (days <= Math.max(horizonDays, 21)) {
        const isTrial = s.status === "trial";
        pushNotice({
          id: noticeId,
          area: "payments",
          areaLabel: "Pagamentos e renovações",
          originKind: "subscription",
          originId: String(s.id),
          title: `${isTrial ? "Fim de período experimental" : "Renovação de subscrição"} · ${s.name}`,
          date: s.nextDate,
          amount: F().money(s.amount || 0),
          priority: days < 0 || (isTrial && days <= 5) ? "high" : days <= 7 ? "medium" : "low",
          naturalState: days < 0 ? "overdue" : "upcoming",
          detail: days < 0 ? `Data de renovação ultrapassada (${Math.abs(days)} dia(s))` : days === 0 ? "Renova hoje" : `Renova em ${days} dia(s)`,
          targetView: "planner",
        });
      }
    }

    // 3b. Planos de prestações (installmentPlans) e Créditos mensais (debts)
    for(const plan of d.installmentPlans||[])for(const payment of plan.payments||[]){
      const due=payment.due||payment.date;if(!F().validDate(due))continue;const days=dayDiff(today,due),remaining=F().money(Math.max(0,Number(payment.amount||0)-Number(payment.paid||0)));if(days>horizonDays)continue;
      pushNotice({id:`installment:${plan.id}:${payment.id}`,area:'payments',areaLabel:'Pagamentos e renovações',originKind:'installmentPlan',originId:String(plan.id),title:`Prestação · ${plan.description||plan.name||'Compra'}`,date:due,amount:remaining,priority:days<0?'high':'medium',naturalState:remaining<=0?'paid':days<0?'overdue':'upcoming',detail:remaining<=0?'Prestação liquidada':`Falta liquidar ${remaining.toFixed(2)} €`,targetView:'planner'});
    }
    for (const debt of d.debts || []) {
      const bal = F().money(debt.balance || 0);
      const pay = F().money(debt.payment || 0);
      const dayNum = Number(debt.dueDay || 0);
      if (!(bal > 0) || !(pay > 0) || !(dayNum >= 1 && dayNum <= 31)) continue;
      for (const m of monthsToCheck.filter(m=>m>=today.slice(0,7))) {
        const [yr, mo] = m.split("-").map(Number);
        const maxDay = new Date(Date.UTC(yr, mo, 0)).getUTCDate();
        const due = `${m}-${String(Math.min(dayNum, maxDay)).padStart(2, "0")}`;
        const days = dayDiff(today, due);
        if(days>horizonDays)continue;
        if(debt.startDate&&due<debt.startDate||debt.endDate&&due>debt.endDate)continue;
        const posted=(d.transactions||[]).filter(t=>t.type==='expense'&&String(t.debtId||'')===String(debt.id)&&String(t.date||'').slice(0,7)===m);
        if(posted.length){pushNotice({id:`debt:${debt.id}:${due}`,area:'payments',areaLabel:'Pagamentos e renovações',originKind:'debt',originId:String(debt.id),title:`Prestação de crédito · ${debt.name}`,date:due,amount:F().money(posted.reduce((n,t)=>n+t.amount,0)),priority:'low',naturalState:'paid',detail:'Pagamento registado no mês · '+posted.map(t=>t.date).join(', '),targetView:'transactions'});continue;}
        pushNotice({
          id: `debt:${debt.id}:${due}`,
          area: "payments",
          areaLabel: "Pagamentos e renovações",
          originKind: "debt",
          originId: String(debt.id),
          title: `Prestação de crédito · ${debt.name}`,
          date: due,
          amount: pay,
          priority: days < 0 ? "high" : days <= 5 ? "medium" : "low",
          naturalState: days < 0 ? "overdue" : "upcoming",
          detail:
            (days < 0 ? `Vencida há ${Math.abs(days)} dia(s)` : days === 0 ? "Vence hoje" : `Vence em ${days} dia(s)`) +
            ` · Capital em dívida: ${bal.toFixed(2)} €`,
          targetView: "wealthMoneyHub",
        });
      }
    }

    // 4. Garantias (practical.equipment e movimentos com warrantyUntil)
    for (const e of d.practical?.equipment || []) {
      if (!F().validDate(e.warranty)) continue;
      const days = dayDiff(today, e.warranty);
      if (days <= Math.max(horizonDays, 45)) {
        pushNotice({
          id: `warranty-eq:${e.id}:${e.warranty}`,
          area: "warranties",
          areaLabel: "Garantias",
          originKind: "equipment",
          originId: String(e.id),
          title: `Garantia · ${e.name}`,
          date: e.warranty,
          amount: e.purchasePrice ?? null,
          priority: days < 0 ? "high" : days <= 15 ? "high" : "medium",
          naturalState: days < 0 ? "overdue" : "upcoming",
          detail: days < 0 ? `Garantia terminou há ${Math.abs(days)} dia(s)` : days === 0 ? "Garantia termina hoje" : `Garantia termina em ${days} dia(s)`,
          targetView: "casaEquipment",
        });
      }
    }
    for (const t of d.transactions || []) {
      if (!F().validDate(t.warrantyUntil)) continue;
      const days = dayDiff(today, t.warrantyUntil);
      if (days <= Math.max(horizonDays, 45)) {
        pushNotice({
          id: `warranty-tx:${t.id}:${t.warrantyUntil}`,
          area: "warranties",
          areaLabel: "Garantias",
          originKind: "transaction",
          originId: String(t.id),
          title: `Garantia de compra · ${t.description}`,
          date: t.warrantyUntil,
          amount: F().money(t.amount || 0),
          priority: days < 0 ? "high" : days <= 15 ? "high" : "medium",
          naturalState: days < 0 ? "overdue" : "upcoming",
          detail: days < 0 ? `Terminou há ${Math.abs(days)} dia(s)` : `Termina em ${days} dia(s)`,
          targetView: "transactions",
        });
      }
    }

    // 5. Validades alimentares (casa.stock)
    if (d.casa?.stock?.length) {
      const cState = C() ? C().state(d) : d.casa;
      const byProd = new Map((cState.catalog || []).map((p) => [String(p.id), p]));
      for (const lot of cState.stock || []) {
        if (!F().validDate(lot.expiry)) continue;
        const rem = CL() && typeof CL().remaining === "function" ? CL().remaining(cState, lot) : Number(lot.qty || 0);
        if (!(rem > 0)) continue;
        const days = dayDiff(today, lot.expiry);
        if (days > horizonDays) continue;
        const prod = byProd.get(String(lot.catalogId));
        const name = prod?.name || lot.name || "Artigo em stock";
        const isExpired = days < 0;
        pushNotice({
          id: `food-expiry:${lot.id}:${lot.expiry}`,
          area: "food",
          areaLabel: "Validades alimentares",
          originKind: "stockLot",
          originId: String(lot.id),
          title: `Validade alimentar · ${name}`,
          date: lot.expiry,
          amount: null,
          priority: isExpired || days <= 2 ? "high" : "medium",
          naturalState: isExpired ? "overdue" : "upcoming",
          detail:
            (isExpired ? `Expirado há ${Math.abs(days)} dia(s)` : days === 0 ? "Expira hoje" : `Expira em ${days} dia(s)`) +
            ` · ${rem} ${lot.unit || prod?.unit || "un"}${lot.location ? ` (${lot.location})` : ""}`,
          targetView: "casaStock",
        });
      }
    }

    // 6. Manutenção de equipamentos e Rotinas domésticas
    for (const e of d.practical?.equipment || []) {
      if (!F().validDate(e.date)) continue;
      if (e.planStatus === "completed") {
        pushNotice({
          id: `eq-plan:${e.id}:${e.date}`,
          area: "routines",
          areaLabel: "Equipamentos e rotinas",
          originKind: "equipment",
          originId: String(e.id),
          title: `${e.kind === "replacement" ? "Substituição" : "Manutenção"} concluída · ${e.name}`,
          date: e.date,
          amount: F().money(e.cost || 0),
          priority: "low",
          naturalState: "paid",
          detail: "Plano concluído",
          targetView: "casaEquipment",
        });
        continue;
      }
      if (e.pendingId && activePendingIds.has(String(e.pendingId))) continue;
      const days = dayDiff(today, e.date);
      if (days <= horizonDays) {
        pushNotice({
          id: `eq-plan:${e.id}:${e.date}`,
          area: "routines",
          areaLabel: "Equipamentos e rotinas",
          originKind: "equipment",
          originId: String(e.id),
          title: `${e.kind === "replacement" ? "Substituição prevista" : "Manutenção prevista"} · ${e.name}`,
          date: e.date,
          amount: F().money(e.cost || 0),
          priority: days < 0 ? "high" : days <= 7 ? "medium" : "low",
          naturalState: days < 0 ? "overdue" : "upcoming",
          detail: days < 0 ? `Atrasada há ${Math.abs(days)} dia(s)` : days === 0 ? "Prevista para hoje" : `Prevista em ${days} dia(s)`,
          targetView: "casaEquipment",
        });
      }
    }

    for (const r of d.practical?.routines || []) {
      if (!r.active) {
        pushNotice({
          id: `routine:${r.id}`,
          area: "routines",
          areaLabel: "Equipamentos e rotinas",
          originKind: "routine",
          originId: String(r.id),
          title: `Rotina inativa · ${r.title}`,
          date: r.nextDate,
          amount: null,
          priority: "low",
          naturalState: "cancelled",
          detail: "Rotina desativada",
          targetView: "casaEquipment",
        });
        continue;
      }
      const days = dayDiff(today, r.nextDate);
      if (days <= horizonDays) {
        const doneSteps = r.checklist.filter((i) => i.done).length;
        pushNotice({
          id: `routine:${r.id}:${r.nextDate}`,
          area: "routines",
          areaLabel: "Equipamentos e rotinas",
          originKind: "routine",
          originId: String(r.id),
          title: `Rotina doméstica · ${r.title}`,
          date: r.nextDate,
          amount: null,
          priority: days < 0 ? "high" : days <= 3 ? "medium" : "low",
          naturalState: days < 0 ? "overdue" : "upcoming",
          detail:
            (days < 0 ? `Em atraso há ${Math.abs(days)} dia(s)` : days === 0 ? "Para hoje" : `Em ${days} dia(s)`) +
            ` · ${r.area || "Geral"}${r.checklist.length ? ` (${doneSteps}/${r.checklist.length} passos)` : ""}`,
          targetView: "casaEquipment",
        });
      }
    }

    // 7. Veículo e Habitação (inspeção, IUC, seguro, revisões, certificado energético, documentos)
    for (const v of d.practical?.vehicles || []) {
      for (const [field, label] of [
        ["nextInspectionDate", "Inspeção periódica"],
        ["iucDate", "Renovação de IUC"],
        ["insuranceDate", "Seguro automóvel"],
        ["nextMaintenanceDate", "Revisão / manutenção"],
      ]) {
        const dt = v[field];
        if (!F().validDate(dt)) continue;
        const days = dayDiff(today, dt);
        if (days <= horizonDays) {
          pushNotice({
            id: `vehicle:${v.id}:${field}:${dt}`,
            area: "dossiers",
            areaLabel: "Veículo e habitação",
            originKind: "vehicle",
            originId: String(v.id),
            title: `${label} · ${v.name}`,
            date: dt,
            amount: null,
            priority: days < 0 ? "high" : days <= 10 ? "medium" : "low",
            naturalState: days < 0 ? "overdue" : "upcoming",
            detail: days < 0 ? `Ultrapassada há ${Math.abs(days)} dia(s)` : days === 0 ? "Hoje" : `Em ${days} dia(s)`,
            targetView: "casaVehicles",
          });
        }
      }
      if (v.nextMaintenanceKm !== null && v.nextMaintenanceKm !== undefined && v.currentKm >= v.nextMaintenanceKm - 1000) {
        const diffKm = round3(v.nextMaintenanceKm - v.currentKm);
        pushNotice({
          id: `vehicle-km:${v.id}:${v.nextMaintenanceKm}`,
          area: "dossiers",
          areaLabel: "Veículo e habitação",
          originKind: "vehicle",
          originId: String(v.id),
          title: `Revisão por quilometragem · ${v.name}`,
          date: today,
          amount: null,
          priority: diffKm <= 0 ? "high" : "medium",
          naturalState: diffKm <= 0 ? "overdue" : "upcoming",
          detail:
            diffKm <= 0
              ? `Meta de ${v.nextMaintenanceKm} km atingida/ultrapassada (${v.currentKm} km atuais)`
              : `Faltam ${diffKm} km para a revisão dos ${v.nextMaintenanceKm} km`,
          targetView: "casaVehicles",
        });
      }
      for (const doc of v.documents || []) {
        if (!F().validDate(doc.validUntil)) continue;
        const days = dayDiff(today, doc.validUntil);
        if (days <= horizonDays) {
          pushNotice({
            id: `vehicle-doc:${v.id}:${doc.id}:${doc.validUntil}`,
            area: "dossiers",
            areaLabel: "Veículo e habitação",
            originKind: "vehicle",
            originId: String(v.id),
            title: `Validade de documento (${doc.title}) · ${v.name}`,
            date: doc.validUntil,
            amount: null,
            priority: days < 0 ? "high" : days <= 10 ? "medium" : "low",
            naturalState: days < 0 ? "overdue" : "upcoming",
            detail: days < 0 ? `Expirou há ${Math.abs(days)} dia(s)` : `Expira em ${days} dia(s)`,
            targetView: "casaVehicles",
          });
        }
      }
    }

    for (const h of d.practical?.housing || []) {
      for (const [field, label] of [
        ["energyValidUntil", "Certificado energético"],
        ["insuranceDate", "Seguro da habitação"],
        ["imiDate", "IMI / imposto predial"],
        ["condominiumDate", "Condomínio / assembleia"],
      ]) {
        const dt = h[field];
        if (!F().validDate(dt)) continue;
        const days = dayDiff(today, dt);
        if (days <= horizonDays) {
          pushNotice({
            id: `housing:${h.id}:${field}:${dt}`,
            area: "dossiers",
            areaLabel: "Veículo e habitação",
            originKind: "housing",
            originId: String(h.id),
            title: `${label} · ${h.name}`,
            date: dt,
            amount: null,
            priority: days < 0 ? "high" : days <= 10 ? "medium" : "low",
            naturalState: days < 0 ? "overdue" : "upcoming",
            detail: days < 0 ? `Ultrapassado há ${Math.abs(days)} dia(s)` : days === 0 ? "Hoje" : `Em ${days} dia(s)`,
            targetView: "casaHousing",
          });
        }
      }
      for (const doc of h.documents || []) {
        if (!F().validDate(doc.validUntil)) continue;
        const days = dayDiff(today, doc.validUntil);
        if (days <= horizonDays) {
          pushNotice({
            id: `housing-doc:${h.id}:${doc.id}:${doc.validUntil}`,
            area: "dossiers",
            areaLabel: "Veículo e habitação",
            originKind: "housing",
            originId: String(h.id),
            title: `Documento (${doc.title}) · ${h.name}`,
            date: doc.validUntil,
            amount: null,
            priority: days < 0 ? "high" : days <= 10 ? "medium" : "low",
            naturalState: days < 0 ? "overdue" : "upcoming",
            detail: days < 0 ? `Expirou há ${Math.abs(days)} dia(s)` : `Expira em ${days} dia(s)`,
            targetView: "casaHousing",
          });
        }
      }
    }

    const reviews = new Map((d.practical?.noticeReviews || []).map((r) => [String(r.id), r]));
    const priorityRank = { high: 0, medium: 1, low: 2 };

    const enriched = raw.map((item) => {
      const review = reviews.get(item.id) || null;
      let effectiveState = item.naturalState;
      let snoozedUntil = null;
      if (item.naturalState === "paid" || item.naturalState === "cancelled") {
        effectiveState = item.naturalState;
      } else if (review) {
        if (review.state === "paid" || review.state === "cancelled" || review.state === "dismissed") {
          effectiveState = review.state;
        } else if (review.state === "snoozed") {
          if (review.until && review.until > today) {
            effectiveState = "snoozed";
            snoozedUntil = review.until;
          }
        }
      }
      const isActive = effectiveState === "overdue" || effectiveState === "upcoming";
      return {
        ...item,
        effectiveState,
        snoozedUntil,
        isActive,
        reviewed: Boolean(review),
      };
    });

    enriched.sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) ||
        (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) ||
        String(a.date || "").localeCompare(String(b.date || "")) ||
        a.title.localeCompare(b.title, "pt-PT"),
    );

    const filterArea = options.area || "all";
    const filterPriority = options.priority || "all";
    const filterStatus = options.status || options.state || "active";
    const filterQuery = fold(options.query || "");

    const filtered = enriched.filter((item) => {
      if (filterArea !== "all" && item.area !== filterArea && item.areaLabel !== filterArea) return false;
      if (filterPriority !== "all" && item.priority !== filterPriority) return false;
      if (filterQuery) {
        const hay = fold(`${item.title} ${item.detail} ${item.areaLabel} ${item.date || ""}`);
        if (!hay.includes(filterQuery)) return false;
      }
      if (filterStatus === "active") return item.isActive;
      if (filterStatus === "overdue") return item.effectiveState === "overdue";
      if (filterStatus === "snoozed") return item.effectiveState === "snoozed";
      if (filterStatus === "dismissed") return item.effectiveState === "dismissed";
      if (filterStatus === "resolved") return item.effectiveState === "paid" || item.effectiveState === "cancelled";
      return true;
    });

    return {
      today,
      all: enriched,
      rows: filtered,
      items: filtered,
      counts: {
        active: enriched.filter((x) => x.isActive).length,
        overdue: enriched.filter((x) => x.effectiveState === "overdue").length,
        high: enriched.filter((x) => x.isActive && x.priority === "high").length,
        medium: enriched.filter((x) => x.isActive && x.priority === "medium").length,
        low: enriched.filter((x) => x.isActive && x.priority === "low").length,
        snoozed: enriched.filter((x) => x.effectiveState === "snoozed").length,
        dismissed: enriched.filter((x) => x.effectiveState === "dismissed").length,
        resolved: enriched.filter((x) => x.effectiveState === "paid" || x.effectiveState === "cancelled").length,
      },
    };
  }

  function reviewNotice(d, noticeId, state, until) {
    if (!validId(noticeId)) throw Error("Identificador de aviso inválido.");
    if (!["paid", "cancelled", "snoozed", "dismissed"].includes(state))
      throw Error("Ação de revisão de aviso inválida.");
    if (state === "snoozed" && (!F().validDate(until) || until <= F().today()))
      throw Error("Escolhe uma data futura para adiar o aviso.");
    return transact(d, (draft) => {
      const list = ensurePractical(draft, "noticeReviews");
      const next = list.filter((r) => String(r.id) !== String(noticeId));
      next.push({
        id: String(noticeId),
        state,
        ...(state === "snoozed" && until ? { until } : {}),
      });
      draft.practical.noticeReviews = next;
    });
  }

  function restoreNotice(d, noticeId) {
    if (!validId(noticeId)) throw Error("Identificador de aviso inválido.");
    return transact(d, (draft) => {
      const list = ensurePractical(draft, "noticeReviews");
      draft.practical.noticeReviews = list.filter((r) => String(r.id) !== String(noticeId));
    });
  }

  const api = {
    FREQUENCIES,
    UTILITIES,
    UNIT_LABELS,
    VEHICLE_FUELS,
    VEHICLE_MAINT_KINDS,
    HOUSING_KINDS,
    validate,
    validatePdfAttachment,
    equipmentCosts,
    allEquipmentCosts,
    routines,
    saveRoutine,
    toggleRoutineCheck,
    completeRoutine,
    removeRoutine,
    utilityReadings,
    saveUtilityReading,
    removeUtilityReading,
    utilityComparison,
    vehicles,
    saveVehicle,
    removeVehicle,
    addVehicleMileage,
    addVehicleFueling,
    addVehicleMaintenance,
    addVehicleDocument,
    removeVehicleSubrecord,
    vehicleSummary,
    housing,
    saveHousing,
    removeHousing,
    addHousingDocument,
    removeHousingDocument,
    housingSummary,
    pdfCatalog,
    searchPdfs,
    updatePdfText,
    noticePreferences,
    saveNoticePreferences,
    notices,
    reviewNotice,
    restoreNotice,
  };

  root.DossiersFinance = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
