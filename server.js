const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 4173);
const baseDir = __dirname;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

const useAzure =
  Boolean(process.env.AZURE_STORAGE_ACCOUNT) &&
  Boolean(process.env.AZURE_STORAGE_SAS_TOKEN) &&
  Boolean(process.env.AZURE_DATALAKE_FILESYSTEM);

const fallbackPortfolios = [
  {
    id: "growth-model",
    name: "Growth Model",
    asOf: "2026-01-31",
    holdings: [
      { name: "US Tech ETF", weight: 30, currency: "USD", region: "North America", sector: "Technology", assetClass: "Equity", value: -0.2, quality: 0.6, momentum: 0.8, size: 0.7, volatility: 0.4 },
      { name: "Europe Financials", weight: 15, currency: "EUR", region: "Europe", sector: "Financials", assetClass: "Equity", value: 0.6, quality: 0.2, momentum: 0.1, size: -0.2, volatility: 0.0 },
      { name: "EM Equity", weight: 20, currency: "USD", region: "Emerging Markets", sector: "Industrials", assetClass: "Equity", value: 0.4, quality: -0.2, momentum: 0.3, size: -0.4, volatility: 0.5 },
      { name: "Global Bonds", weight: 25, currency: "USD", region: "Other", sector: "Other", assetClass: "Fixed Income", value: 0.2, quality: 0.3, momentum: -0.3, size: 0.0, volatility: -0.7 },
      { name: "Cash", weight: 10, currency: "EUR", region: "Europe", sector: "Other", assetClass: "Cash", value: 0, quality: 0, momentum: 0, size: 0, volatility: -0.2 }
    ]
  }
];

function normalizeSasToken(raw) {
  if (!raw) return "";
  return raw.startsWith("?") ? raw.slice(1) : raw;
}

function getAzureConfig() {
  return {
    account: process.env.AZURE_STORAGE_ACCOUNT,
    sasToken: normalizeSasToken(process.env.AZURE_STORAGE_SAS_TOKEN),
    fileSystem: process.env.AZURE_DATALAKE_FILESYSTEM,
    directory: process.env.AZURE_DATALAKE_DIRECTORY || "portfolios",
  };
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Azure request failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

function azureBaseUrl({ account, fileSystem }) {
  return `https://${account}.dfs.core.windows.net/${encodeURIComponent(fileSystem)}`;
}

async function listPortfolioFiles() {
  const config = getAzureConfig();
  const endpoint = `${azureBaseUrl(config)}?resource=filesystem&directory=${encodeURIComponent(
    config.directory
  )}&recursive=false&${config.sasToken}`;
  const body = await fetchJson(endpoint);

  return (body.paths || [])
    .filter((item) => item.isDirectory !== "true" && String(item.name).endsWith(".json"))
    .map((item) => path.basename(item.name));
}

async function readPortfolioByFileName(fileName) {
  const config = getAzureConfig();
  const endpoint = `${azureBaseUrl(config)}/${encodeURIComponent(config.directory)}/${encodeURIComponent(
    fileName
  )}?${config.sasToken}`;
  return fetchJson(endpoint);
}

async function handleApi(req, res, parsedUrl) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed." });
  }

  if (parsedUrl.pathname === "/api/source") {
    return json(res, 200, {
      source: useAzure ? "azure-datalake" : "fallback-local",
      details: useAzure
        ? {
            account: process.env.AZURE_STORAGE_ACCOUNT,
            filesystem: process.env.AZURE_DATALAKE_FILESYSTEM,
            directory: process.env.AZURE_DATALAKE_DIRECTORY || "portfolios",
          }
        : { message: "Azure environment variables missing. Serving fallback sample portfolio." },
    });
  }

  if (parsedUrl.pathname === "/api/portfolios") {
    try {
      if (!useAzure) {
        return json(
          res,
          200,
          fallbackPortfolios.map(({ id, name, asOf }) => ({ id, name, asOf }))
        );
      }

      const files = await listPortfolioFiles();
      const metadata = await Promise.all(
        files.map(async (file) => {
          const body = await readPortfolioByFileName(file);
          return {
            id: body.id || file.replace(/\.json$/i, ""),
            name: body.name || file,
            asOf: body.asOf || "unknown",
          };
        })
      );
      return json(res, 200, metadata);
    } catch (error) {
      return json(res, 500, {
        error: "Failed to load portfolio list from Azure Data Lake.",
        details: error.message,
      });
    }
  }

  const match = parsedUrl.pathname.match(/^\/api\/portfolios\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);

    try {
      if (!useAzure) {
        const portfolio = fallbackPortfolios.find((item) => item.id === id);
        if (!portfolio) {
          return json(res, 404, { error: `Fallback portfolio '${id}' not found.` });
        }
        return json(res, 200, portfolio);
      }

      const body = await readPortfolioByFileName(`${id}.json`);
      return json(res, 200, body);
    } catch (error) {
      return json(res, 500, {
        error: `Failed to load portfolio '${id}' from Azure Data Lake.`,
        details: error.message,
      });
    }
  }

  return json(res, 404, { error: "API endpoint not found." });
}

function serveStatic(req, res, parsedUrl) {
  const incomingPath = parsedUrl.pathname === "/" ? "/index.html" : parsedUrl.pathname;
  const safePath = path.normalize(incomingPath).replace(/^\.\.(\/|\\|$)/, "");
  const filePath = path.join(baseDir, safePath);

  if (!filePath.startsWith(baseDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  if (parsedUrl.pathname.startsWith("/api/")) {
    await handleApi(req, res, parsedUrl);
    return;
  }
  serveStatic(req, res, parsedUrl);
});

server.listen(PORT, () => {
  console.log(`Portfolio Insight Studio running on http://localhost:${PORT}`);
});
