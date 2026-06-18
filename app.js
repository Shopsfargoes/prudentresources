// app.js
// -----------------------------------------------------------------------
// Fetches the logged-in investor's capital account data and strategy
// allocations from WordPress (via the Vercel proxy) and renders them.
// -----------------------------------------------------------------------

(() => {
  const els = {
    banner: document.getElementById("status-banner"),
    statusText: document.getElementById("status-text"),
    retryBtn: document.getElementById("retry-btn"),
    logoutBtn: document.getElementById("logout-btn"),
    investorName: document.getElementById("investor-name"),
    currentValue: document.getElementById("current-value"),
    amountInvested: document.getElementById("amount-invested"),
    netGain: document.getElementById("net-gain"),
    netGainPct: document.getElementById("net-gain-pct"),
    valueAsOf: document.getElementById("value-asof"),
    holdingsBody: document.getElementById("holdings-body"),
    holdingsEmpty: document.getElementById("holdings-empty"),
    holdingsCount: document.getElementById("holdings-count"),
    chartCanvas: document.getElementById("value-chart"),
    chartEmpty: document.getElementById("chart-empty"),
    chartRange: document.getElementById("chart-range"),
  };

  let chartInstance = null;
  let fullHistory = [];
  let activeRange = "all";

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });

  function getToken() {
    return localStorage.getItem(WP_CONFIG.AUTH_TOKEN_KEY);
  }

  function authHeaders() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  class ApiError extends Error {
    constructor(message, kind) {
      super(message);
      this.kind = kind;
    }
  }

  async function apiFetch(path) {
    const res = await fetch(`${WP_CONFIG.PROXY_URL}?path=${encodeURIComponent(path)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
    });

    if (res.status === 401 || res.status === 403) {
      throw new ApiError("Your session has expired. Please sign in again.", "auth");
    }
    if (!res.ok) {
      throw new ApiError(`Request failed (${res.status}). Please try again.`, "server");
    }
    return res.json();
  }

  function showBanner(message) {
    els.statusText.textContent = message;
    els.banner.hidden = false;
  }

  function hideBanner() {
    els.banner.hidden = true;
  }

  function formatCurrency(value) {
    return currencyFormatter.format(Math.abs(Number(value) || 0));
  }

  function setFigure(el, value, { signed = false } = {}) {
    const num = Number(value) || 0;
    el.classList.remove("is-positive", "is-negative");
    if (signed) {
      const sign = num > 0 ? "+" : num < 0 ? "−" : "";
      el.textContent = `${sign}$${formatCurrency(num)}`;
      if (num > 0) el.classList.add("is-positive");
      if (num < 0) el.classList.add("is-negative");
    } else {
      el.textContent = formatCurrency(num);
    }
  }

  function renderSummary({ name, amountInvested, currentValue }) {
    els.investorName.textContent = name || "Investor";

    const invested = Number(amountInvested) || 0;
    const current = Number(currentValue) || 0;
    const gain = current - invested;
    const gainPct = invested !== 0 ? (gain / invested) * 100 : 0;

    setFigure(els.currentValue, current);
    setFigure(els.amountInvested, invested);
    setFigure(els.netGain, gain, { signed: true });

    els.netGainPct.textContent = invested !== 0
      ? `${gainPct > 0 ? "+" : ""}${gainPct.toFixed(2)}% all-time`
      : "";

    els.valueAsOf.textContent = `As of ${dateFormatter.format(new Date())}`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderHoldings(holdings) {
    els.holdingsBody.innerHTML = "";

    if (!Array.isArray(holdings) || holdings.length === 0) {
      els.holdingsEmpty.hidden = false;
      els.holdingsCount.textContent = "";
      return;
    }

    els.holdingsEmpty.hidden = true;
    els.holdingsCount.textContent = `${holdings.length} allocation${holdings.length === 1 ? "" : "s"}`;

    holdings.forEach((item) => {
      const invested = Number(item.amount_invested) || 0;
      const current = Number(item.current_value) || 0;
      const change = invested !== 0 ? ((current - invested) / invested) * 100 : 0;
      const changeClass = change > 0 ? "is-positive" : change < 0 ? "is-negative" : "";
      const changeSign = change > 0 ? "+" : "";

      const row = document.createElement("div");
      row.className = "holdings__row";
      row.setAttribute("role", "row");
      row.innerHTML = `
        <span class="holdings__asset">${escapeHtml(item.label || "Untitled")}</span>
        <span class="holdings__figure">$${formatCurrency(invested)}</span>
        <span class="holdings__figure">$${formatCurrency(current)}</span>
        <span class="holdings__change ${changeClass}">${changeSign}${change.toFixed(2)}%</span>
      `;
      els.holdingsBody.appendChild(row);
    });
  }

  function filterHistoryByRange(history, range) {
    if (range === "all" || history.length === 0) return history;
    const now = new Date();
    const cutoff = new Date(now);
    if (range === "3m") cutoff.setMonth(cutoff.getMonth() - 3);
    if (range === "1y") cutoff.setFullYear(cutoff.getFullYear() - 1);

    const filtered = history.filter((p) => new Date(p.date) >= cutoff);
    if (filtered.length === 0 && history.length > 0) return [history[history.length - 1]];
    if (filtered.length > 0) {
      const firstKeptIndex = history.indexOf(filtered[0]);
      if (firstKeptIndex > 0) return [history[firstKeptIndex - 1], ...filtered];
    }
    return filtered;
  }

  function renderChart(history) {
    fullHistory = Array.isArray(history) ? [...history] : [];
    fullHistory.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (fullHistory.length === 0) {
      els.chartEmpty.hidden = false;
      els.chartCanvas.style.display = "none";
      return;
    }

    els.chartEmpty.hidden = true;
    els.chartCanvas.style.display = "block";
    drawChart(filterHistoryByRange(fullHistory, activeRange));
  }

  function drawChart(points) {
    const labels = points.map((p) =>
      new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "2-digit" }).format(new Date(p.date))
    );
    const values = points.map((p) => Number(p.value) || 0);
    const first = values[0];
    const last = values[values.length - 1];
    const lineColor = last >= first ? "#4FA877" : "#C9614C";

    const ctx = els.chartCanvas.getContext("2d");
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: lineColor,
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: lineColor,
          tension: 0.25,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#152033",
            borderColor: "#233044",
            borderWidth: 1,
            titleFont: { family: "'IBM Plex Mono', monospace", size: 11 },
            bodyFont: { family: "'IBM Plex Mono', monospace", size: 12 },
            padding: 10,
            callbacks: {
              label: (ctx) => `$${ctx.parsed.y.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: "#233044", drawTicks: false },
            ticks: { color: "#8C97AC", font: { family: "'IBM Plex Mono', monospace", size: 10 }, maxRotation: 0 },
            border: { color: "#233044" },
          },
          y: {
            grid: { color: "#233044", drawTicks: false },
            ticks: {
              color: "#8C97AC",
              font: { family: "'IBM Plex Mono', monospace", size: 10 },
              callback: (val) => `$${Number(val).toLocaleString("en-US")}`,
            },
            border: { display: false },
          },
        },
      },
    });
  }

  async function loadPortfolio() {
    hideBanner();
    try {
      const me = await apiFetch(WP_CONFIG.ENDPOINTS.me);
      const acf = me.acf || {};

      renderSummary({
        name: me.name,
        amountInvested: acf[WP_CONFIG.FIELDS.amountInvested],
        currentValue: acf[WP_CONFIG.FIELDS.currentValue],
      });

      renderChart(acf[WP_CONFIG.FIELDS.valueHistory]);

      const holdings = await apiFetch(WP_CONFIG.ENDPOINTS.holdings);
      renderHoldings(holdings);
    } catch (err) {
      if (err instanceof ApiError && err.kind === "auth") {
        showBanner(err.message);
        setTimeout(() => {
          localStorage.removeItem(WP_CONFIG.AUTH_TOKEN_KEY);
          window.location.href = "/login.html";
        }, 1500);
        return;
      }
      showBanner(err.message || "Couldn't load your account. Please try again.");
    }
  }

  els.retryBtn.addEventListener("click", loadPortfolio);

  els.chartRange.addEventListener("click", (e) => {
    const btn = e.target.closest(".chart-range__btn");
    if (!btn) return;
    activeRange = btn.dataset.range;
    els.chartRange.querySelectorAll(".chart-range__btn").forEach((b) => b.classList.toggle("is-active", b === btn));
    if (fullHistory.length > 0) drawChart(filterHistoryByRange(fullHistory, activeRange));
  });

  els.logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(WP_CONFIG.AUTH_TOKEN_KEY);
    window.location.href = "/login.html";
  });

  if (!getToken()) {
    window.location.href = "/login.html";
  } else {
    loadPortfolio();
  }
})();
