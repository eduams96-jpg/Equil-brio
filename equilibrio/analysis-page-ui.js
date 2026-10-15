/* Compact long analysis lists without discarding rows or their actions. */
(function () {
  "use strict";

  const expanded = new Map();
  const rules = [
    ["#insights #recurringList", ".recurring-setting-row", 4, "movimentos regulares"],
    ["#insights #categoryBreakdown", ".breakdown-row", 6, "categorias"],
    ["#insights #comparisonPanel", ".comparison-row", 6, "categorias"],
    ["#insights #merchantsPanel", ".rank-row", 5, "estabelecimentos"],
    ["#insights #subscriptionsPanel", ".transaction-item", 5, "compromissos"],
    ["#insights #categoryDrill", "button", 0, "categorias"],
    ["#reports #annualCategories", ".breakdown-row", 6, "categorias"],
    ["#reports #alertsList", ".alert", 4, "alertas"],
  ];

  function fold(host, rowSelector, limit, noun, key) {
    if (!host || host.querySelector(":scope > .analysis-more")) return;
    const rows = [...host.children].filter((node) => node.matches(rowSelector));
    if (rows.length <= limit) return;

    const remaining = rows.length - limit;
    const details = document.createElement("details");
    details.className = "analysis-more";
    details.dataset.analysisList = key;
    const summary = document.createElement("summary");
    const label = document.createElement("span");
    const badge = document.createElement("b");
    badge.textContent = `+${remaining}`;
    badge.setAttribute("aria-hidden", "true");
    summary.append(label, badge);
    details.append(summary);
    const body = document.createElement("div");
    body.className = "analysis-more-body";
    details.append(body);
    host.insertBefore(details, rows[limit]);
    rows.slice(limit).forEach((row) => body.append(row));
    details.open = expanded.get(key) === true;
    const update = () => {
      label.textContent = details.open ? `Mostrar menos ${noun}` : `Ver mais ${remaining} ${noun}`;
      expanded.set(key, details.open);
    };
    details.addEventListener("toggle", update);
    update();
  }

  function enhance() {
    for (const [selector, rowSelector, limit, noun] of rules)
      fold(document.querySelector(selector), rowSelector, limit, noun, selector);

    // The annual report is already optional. Its short category lists need no
    // second disclosure; only an unbounded collection of notes gets folded.
    const annual = document.querySelector("#reports #lifeAnnualReport");
    if (annual) {
      const notes = annual.querySelector(".attention-row")?.closest(".annual-analysis-card");
      fold(notes, ".attention-row", 4, "acontecimentos", "annual-notes");
    }
  }

  const year = document.querySelector("#reportYear");
  year?.addEventListener("change", () => queueMicrotask(enhance));
  window.AnalysisUI = { enhance };
  enhance();
})();
