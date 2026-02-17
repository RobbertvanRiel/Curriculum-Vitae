const categories = {
  currencies: ["USD", "EUR", "GBP", "JPY", "Other"],
  regions: ["North America", "Europe", "Asia Pacific", "Emerging Markets", "Other"],
  sectors: ["Technology", "Financials", "Healthcare", "Industrials", "Consumer", "Energy", "Other"],
  assetClasses: ["Equity", "Fixed Income", "Real Assets", "Cash", "Alternatives"],
};

const factors = ["value", "quality", "momentum", "size", "volatility"];

const state = {
  holdings: [],
  modelPortfolio: {
    currency: { USD: 55, EUR: 30, GBP: 5, JPY: 5, Other: 5 },
    region: { "North America": 50, Europe: 25, "Asia Pacific": 10, "Emerging Markets": 10, Other: 5 },
    sector: { Technology: 24, Financials: 16, Healthcare: 14, Industrials: 12, Consumer: 14, Energy: 8, Other: 12 },
    assetClass: { Equity: 65, "Fixed Income": 25, "Real Assets": 5, Cash: 3, Alternatives: 2 },
    factors: { value: 0.2, quality: 0.3, momentum: 0.2, size: 0.1, volatility: -0.2 },
  },
  msciWorld: {
    region: { "North America": 71, Europe: 18, "Asia Pacific": 9, "Emerging Markets": 0, Other: 2 },
    sector: { Technology: 23, Financials: 15, Healthcare: 11, Industrials: 11, Consumer: 12, Energy: 5, Other: 23 },
    factors: { value: 0.0, quality: 0.15, momentum: 0.1, size: 0.2, volatility: 0.0 },
  },
};

const holdingsBody = document.getElementById("holdingsBody");
const allocationInsights = document.getElementById("allocationInsights");
const factorInsight = document.getElementById("factorInsight");
const healthSummary = document.getElementById("healthSummary");
const benchmarkGrid = document.getElementById("benchmarkGrid");
const deviationFlags = document.getElementById("deviationFlags");
const sourceStatus = document.getElementById("sourceStatus");
const portfolioSelect = document.getElementById("portfolioSelect");

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

function normalizeHolding(rawHolding) {
  return {
    name: rawHolding.name || "Unnamed holding",
    weight: clamp(rawHolding.weight, 0, 100),
    currency: categories.currencies.includes(rawHolding.currency) ? rawHolding.currency : "Other",
    region: categories.regions.includes(rawHolding.region) ? rawHolding.region : "Other",
    sector: categories.sectors.includes(rawHolding.sector) ? rawHolding.sector : "Other",
    assetClass: categories.assetClasses.includes(rawHolding.assetClass) ? rawHolding.assetClass : "Alternatives",
    value: clamp(rawHolding.value, -1.5, 1.5),
    quality: clamp(rawHolding.quality, -1.5, 1.5),
    momentum: clamp(rawHolding.momentum, -1.5, 1.5),
    size: clamp(rawHolding.size, -1.5, 1.5),
    volatility: clamp(rawHolding.volatility, -1.5, 1.5),
  };
}

function addHolding() {
  state.holdings.push(
    normalizeHolding({
      name: "New Holding",
      weight: 0,
      currency: "USD",
      region: "North America",
      sector: "Technology",
      assetClass: "Equity",
      value: 0,
      quality: 0,
      momentum: 0,
      size: 0,
      volatility: 0,
    })
  );
  renderAll();
}

function removeHolding(index) {
  state.holdings.splice(index, 1);
  renderAll();
}

function updateHolding(index, key, rawValue) {
  if (["weight"].includes(key)) {
    state.holdings[index][key] = clamp(rawValue, 0, 100);
  } else if (factors.includes(key)) {
    state.holdings[index][key] = clamp(rawValue, -1.5, 1.5);
  } else {
    state.holdings[index][key] = rawValue;
  }
  renderInsights();
}

function renderHoldingRow(holding, index) {
  const row = document.createElement("tr");

  const select = (key, options) => `
    <select data-index="${index}" data-key="${key}">
      ${options
        .map((option) => `<option value="${option}" ${holding[key] === option ? "selected" : ""}>${option}</option>`)
        .join("")}
    </select>
  `;

  row.innerHTML = `
    <td><input type="text" data-index="${index}" data-key="name" value="${holding.name}"/></td>
    <td><input type="number" min="0" max="100" step="0.1" data-index="${index}" data-key="weight" value="${holding.weight}"/></td>
    <td>${select("currency", categories.currencies)}</td>
    <td>${select("region", categories.regions)}</td>
    <td>${select("sector", categories.sectors)}</td>
    <td>${select("assetClass", categories.assetClasses)}</td>
    ${factors
      .map(
        (factor) =>
          `<td><input type="number" min="-1.5" max="1.5" step="0.1" data-index="${index}" data-key="${factor}" value="${holding[factor]}"/></td>`
      )
      .join("")}
    <td><button class="btn danger" data-remove="${index}">Remove</button></td>
  `;

  return row;
}

function aggregateByDimension(dimension, options) {
  return options.reduce((acc, option) => {
    const total = state.holdings
      .filter((holding) => holding[dimension] === option)
      .reduce((sum, holding) => sum + Number(holding.weight || 0), 0);
    acc[option] = Number(total.toFixed(2));
    return acc;
  }, {});
}

function getFactorExposure() {
  const totalWeight = state.holdings.reduce((sum, holding) => sum + Number(holding.weight || 0), 0) || 1;
  return factors.reduce((acc, factor) => {
    const weighted = state.holdings.reduce(
      (sum, holding) => sum + (Number(holding.weight || 0) * Number(holding[factor] || 0)) / totalWeight,
      0
    );
    acc[factor] = Number(weighted.toFixed(2));
    return acc;
  }, {});
}

function getMaxAbsDeviation(mapA, mapB) {
  return Object.keys(mapB).reduce(
    (max, key) => Math.max(max, Math.abs((Number(mapA[key]) || 0) - (Number(mapB[key]) || 0))),
    0
  );
}

function statusTag(value, low, high) {
  if (value <= low) return '<span class="tag good">Aligned</span>';
  if (value <= high) return '<span class="tag warn">Watch</span>';
  return '<span class="tag bad">Off target</span>';
}

function renderBenchmarkCards() {
  const cards = [
    ["Model portfolio", "Asset class + factor targets"],
    ["MSCI World", "Region + sector + factor baseline"],
  ]
    .map(
      ([title, text]) => `<article class="kpi"><h4>${title}</h4><p>${text}</p></article>`
    )
    .join("");
  benchmarkGrid.innerHTML = cards;
}

function renderAllocationCard(title, actual, benchmark) {
  const rows = Object.keys(actual)
    .map((key) => {
      const actualValue = Number(actual[key] || 0);
      const benchmarkValue = Number((benchmark || {})[key] || 0);
      const deviation = actualValue - benchmarkValue;
      return `
        <div class="bar-row">
          <div>
            <strong>${key}</strong><br />
            <small>${actualValue.toFixed(1)}% vs benchmark ${benchmarkValue.toFixed(1)}% (Δ ${deviation >= 0 ? "+" : ""}${deviation.toFixed(1)}%)</small>
            <div class="bar"><div class="bar-fill" style="width:${Math.min(actualValue, 100)}%"></div></div>
          </div>
          <span>${actualValue.toFixed(1)}%</span>
        </div>
      `;
    })
    .join("");

  return `<article class="kpi"><h4>${title}</h4>${rows}</article>`;
}

function renderHealth() {
  const totalWeight = state.holdings.reduce((sum, holding) => sum + Number(holding.weight || 0), 0);
  const currency = aggregateByDimension("currency", categories.currencies);
  const region = aggregateByDimension("region", categories.regions);
  const sector = aggregateByDimension("sector", categories.sectors);
  const assetClass = aggregateByDimension("assetClass", categories.assetClasses);

  const assetClassDeviation = getMaxAbsDeviation(assetClass, state.modelPortfolio.assetClass);
  const regionDeviation = getMaxAbsDeviation(region, state.msciWorld.region);

  healthSummary.innerHTML = `
    <article class="kpi">
      <h4>Total portfolio weight</h4>
      <p>${totalWeight.toFixed(1)}% ${statusTag(Math.abs(totalWeight - 100), 0.5, 2.5)}</p>
    </article>
    <article class="kpi">
      <h4>Max asset-class deviation vs model</h4>
      <p>${assetClassDeviation.toFixed(1)}% ${statusTag(assetClassDeviation, 5, 10)}</p>
    </article>
    <article class="kpi">
      <h4>Max regional deviation vs MSCI World</h4>
      <p>${regionDeviation.toFixed(1)}% ${statusTag(regionDeviation, 8, 15)}</p>
    </article>
  `;

  allocationInsights.innerHTML = [
    renderAllocationCard("Currency allocation", currency, state.modelPortfolio.currency),
    renderAllocationCard("Region allocation", region, state.msciWorld.region),
    renderAllocationCard("Sector allocation", sector, state.msciWorld.sector),
    renderAllocationCard("Asset-class allocation", assetClass, state.modelPortfolio.assetClass),
  ].join("");
}

function renderFactorExposure() {
  const exposure = getFactorExposure();

  const rows = factors
    .map((factor) => {
      const portfolio = Number(exposure[factor] || 0);
      const model = Number(state.modelPortfolio.factors[factor] || 0);
      const msci = Number(state.msciWorld.factors[factor] || 0);
      const deltaModel = portfolio - model;
      const deltaMsci = portfolio - msci;

      return `
        <tr>
          <td><strong>${factor[0].toUpperCase()}${factor.slice(1)}</strong></td>
          <td>${portfolio.toFixed(2)}</td>
          <td>${model.toFixed(2)}</td>
          <td>${msci.toFixed(2)}</td>
          <td>${deltaModel >= 0 ? "+" : ""}${deltaModel.toFixed(2)}</td>
          <td>${deltaMsci >= 0 ? "+" : ""}${deltaMsci.toFixed(2)}</td>
        </tr>
      `;
    })
    .join("");

  factorInsight.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Factor</th>
            <th>Portfolio</th>
            <th>Model</th>
            <th>MSCI World</th>
            <th>Δ vs model</th>
            <th>Δ vs MSCI</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderFlags() {
  const flags = [];
  const totalWeight = state.holdings.reduce((sum, holding) => sum + Number(holding.weight || 0), 0);
  if (Math.abs(totalWeight - 100) > 0.5) {
    flags.push(`Portfolio weights total ${totalWeight.toFixed(1)}%. Rebalance toward 100%.`);
  }

  const assetClass = aggregateByDimension("assetClass", categories.assetClasses);
  Object.entries(state.modelPortfolio.assetClass).forEach(([key, target]) => {
    const actual = Number(assetClass[key] || 0);
    if (Math.abs(actual - target) > 8) {
      flags.push(`${key} allocation deviates by ${(actual - target).toFixed(1)}% from model target.`);
    }
  });

  const exposure = getFactorExposure();
  factors.forEach((factor) => {
    const deltaModel = Math.abs(exposure[factor] - state.modelPortfolio.factors[factor]);
    if (deltaModel > 0.35) {
      flags.push(`${factor} factor is ${deltaModel.toFixed(2)} away from model exposure. Consider sleeve adjustments.`);
    }
  });

  if (flags.length === 0) {
    flags.push("No material deviations detected. Portfolio is aligned with targets.");
  }

  deviationFlags.innerHTML = flags.map((flag) => `<li class="kpi">${flag}</li>`).join("");
}

function renderInsights() {
  renderHealth();
  renderFactorExposure();
  renderFlags();
}

function renderHoldings() {
  holdingsBody.innerHTML = "";
  state.holdings.forEach((holding, index) => {
    holdingsBody.appendChild(renderHoldingRow(holding, index));
  });
}

function renderAll() {
  renderHoldings();
  renderBenchmarkCards();
  renderInsights();
}

async function loadSourceStatus() {
  const response = await fetch("/api/source");
  const body = await response.json();
  if (body.source === "azure-datalake") {
    sourceStatus.textContent = `Data source: Azure Data Lake (${body.details.account}/${body.details.filesystem}/${body.details.directory})`;
  } else {
    sourceStatus.textContent = "Data source: fallback sample (set Azure env vars to use Data Lake).";
  }
}

async function refreshPortfolios() {
  const response = await fetch("/api/portfolios");
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || "Could not load portfolio list");
  }

  portfolioSelect.innerHTML = body
    .map((portfolio) => `<option value="${portfolio.id}">${portfolio.name} (${portfolio.asOf})</option>`)
    .join("");

  if (body.length > 0) {
    await loadSelectedPortfolio();
  }
}

async function loadSelectedPortfolio() {
  const portfolioId = portfolioSelect.value;
  if (!portfolioId) {
    state.holdings = [];
    renderAll();
    return;
  }

  const response = await fetch(`/api/portfolios/${portfolioId}`);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "Could not load selected portfolio");
  }

  state.holdings = (body.holdings || []).map(normalizeHolding);
  renderAll();
}

function bindEvents() {
  holdingsBody.addEventListener("input", (event) => {
    const { index, key } = event.target.dataset;
    if (index !== undefined && key) {
      updateHolding(Number(index), key, event.target.value);
    }
  });

  holdingsBody.addEventListener("change", (event) => {
    const { index, key } = event.target.dataset;
    if (index !== undefined && key) {
      updateHolding(Number(index), key, event.target.value);
    }
  });

  holdingsBody.addEventListener("click", (event) => {
    if (event.target.dataset.remove !== undefined) {
      removeHolding(Number(event.target.dataset.remove));
    }
  });

  document.getElementById("addHolding").addEventListener("click", addHolding);
  document.getElementById("refreshPortfolios").addEventListener("click", async () => {
    try {
      await refreshPortfolios();
    } catch (error) {
      sourceStatus.textContent = error.message;
    }
  });
  document.getElementById("loadPortfolio").addEventListener("click", async () => {
    try {
      await loadSelectedPortfolio();
    } catch (error) {
      sourceStatus.textContent = error.message;
    }
  });
}

async function bootstrap() {
  bindEvents();
  renderBenchmarkCards();
  try {
    await loadSourceStatus();
    await refreshPortfolios();
  } catch (error) {
    sourceStatus.textContent = `Unable to load data: ${error.message}`;
    state.holdings = [];
    renderAll();
  }
}

bootstrap();
