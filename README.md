# Portfolio Insight Studio

Portfolio analytics app that **loads holdings from Azure Data Lake** and computes:

- Allocation insights (currency, region, sector, asset class)
- Factor exposures (value, quality, momentum, size, volatility)
- Deviations versus a model portfolio and MSCI World baseline

## Run

```bash
npm install
npm start
```

App is served on `http://localhost:4173` by default.

## Azure Data Lake configuration

Set these environment variables before starting:

- `AZURE_STORAGE_ACCOUNT` (e.g. `mydatalakeaccount`)
- `AZURE_STORAGE_SAS_TOKEN` (SAS token with read/list permission)
- `AZURE_DATALAKE_FILESYSTEM` (container/filesystem name)
- `AZURE_DATALAKE_DIRECTORY` (optional, defaults to `portfolios`)

If variables are missing, the app automatically uses a local fallback sample portfolio.

## Expected portfolio file format

Each portfolio should be a JSON file named `<portfolio-id>.json` in the configured Data Lake directory.

Example:

```json
{
  "id": "balanced-eur",
  "name": "Balanced EUR",
  "asOf": "2026-01-31",
  "holdings": [
    {
      "name": "Global Equity ETF",
      "weight": 40,
      "currency": "EUR",
      "region": "Europe",
      "sector": "Technology",
      "assetClass": "Equity",
      "value": 0.1,
      "quality": 0.3,
      "momentum": 0.2,
      "size": -0.1,
      "volatility": 0.2
    }
  ]
}
```

## API endpoints

- `GET /api/source` → active data source info
- `GET /api/portfolios` → available portfolios from Data Lake directory
- `GET /api/portfolios/:id` → portfolio details/holdings
