/* Património: o cálculo partilhado pelo Windows (wealth-analysis-v3.js) e pelo Android. Sem DOM. */
(function (root) {
  "use strict";
  const F = root.Finance || (typeof require === "function" ? require("./finance.js") : null);
  const L = root.LifeFinance || (typeof require === "function" ? require("./life-model.js") : null);
  const total = (list, value) => F.money((list || []).reduce((sum, item) => sum + (Number(value(item)) || 0), 0));

  function summary(d, today = F.today()) {
    const accounts = (d.accounts || []).filter((item) => !item.archived);
    const investmentList = d.investments || [];
    const assetList = d.assets || [];
    const debtList = d.debts || [];
    const cash = total(d.accounts || [], (item) => F.balanceAt(d, item, today));
    const investments = total(investmentList, (item) => item.value);
    const assets = (L && L.assetTotal ? L.assetTotal(d) : 0) || 0;
    const debts = total(debtList, (item) => item.balance);
    const owed = debtList.filter((item) => item.balance > 0);
    const monthlyPayments = total(owed, (item) => item.payment);
    const net = F.money(cash + investments + assets - debts);
    const positive = Math.max(0, cash) + Math.max(0, investments) + Math.max(0, assets);
    const saved = [...(d.wealthHistory || [])]
      .filter((item) => Number.isFinite(Number(item.net)) && item.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date));
    const previous = saved.at(-1);
    const history = saved
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date || ""))
      .slice(-12)
      .map((item) => ({ date: item.date, net: Number(item.net) }));
    const share = (value) => (positive ? (Math.max(0, value) / positive) * 100 : 0);
    const Rec = root.ReconciliationModel || (typeof require === "function" ? require("./reconciliation-model.js") : null);
    const unchecked = accounts.filter((item) => {
      const st = Rec?.accountState?.(d, item, today);
      if (st?.statement) return !st.confirmed;
      const posted = (d.transactions || [])
        .filter((t) => t.account === item.name || t.targetAccount === item.name)
        .map((t) => (t.targetAccount === item.name ? t.targetDate || t.date : t.date))
        .filter((date) => F.validDate(date) && date <= today)
        .sort()
        .at(-1);
      return !(F.validDate(item.reconciledOn) && (!posted || posted <= item.reconciledOn));
    }).length;
    return {
      cash, investments, assets, debts, monthlyPayments, net, positive,
      delta: previous ? F.money(net - Number(previous.net)) : null,
      previousDate: previous ? previous.date : null,
      parts: [
        { key: "accounts", label: "Contas", value: cash, share: share(cash), count: accounts.length },
        { key: "investments", label: "Investimentos", value: investments, share: share(investments), count: investmentList.length },
        { key: "assets", label: "Bens", value: assets, share: share(assets), count: assetList.length },
      ],
      debtCount: owed.length,
      unchecked,
      history,
      historyCount: saved.length,
    };
  }

  const api = { summary };
  root.WealthModel = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
