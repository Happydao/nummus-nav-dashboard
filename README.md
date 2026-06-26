# NUMMUS NAV Dashboard

Official data architecture for the NUMMUS NAV / Treasury Backing dashboard.

This repository is intentionally focused on historical portfolio-level metrics only:

- Vault Value (USD)
- Supply
- NAV
- Treasury Backing
- Premium vs NAV
- Burn history

It is not a vault-composition dashboard. Token balances, positions, and asset allocation belong in separate products.

## Status

The first implementation creates the collector layer, documentation, and generated data shape. It does not implement the UI yet and does not backfill mocked historical values.

## Repository Structure

```text
collector/
  collectVaultHistory.ts
  collectSupplyHistory.ts
  collectBurnHistory.ts
  collectPriceHistory.ts
  buildHistory.ts
data/
  history.json
src/
  utils/
```

## Commands

```bash
npm install
npm run check
npm run collect
```

`npm run collect` writes `data/history.json`.

## Generated Dataset

Each record in `data/history.json` follows this shape:

```json
{
  "date": "2026-06-26",
  "vaultUsd": null,
  "supply": 98152185.149189,
  "marketPrice": 0.00737344,
  "nav": null,
  "backing": null,
  "premium": null,
  "burned": null
}
```

Fields are `null` when the collector cannot reconstruct them reliably from public data. This is expected until a historical vault valuation source and historical price source are configured.

## Calculations

```text
NAV = Vault Value USD / Current Supply
Treasury Backing = NAV / Market Price * 100
Premium = Market Price / NAV
```

Calculations only run when all required inputs exist for the same date.

## Data Sources

See [DATA_SOURCES.md](./DATA_SOURCES.md) for the source-by-source reconstruction plan and known limitations.
