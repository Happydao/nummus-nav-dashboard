# NUMMUS NAV Dashboard

Official daily NAV / Treasury Backing dashboard for NUMMUS.

This repository intentionally starts historical tracking from the day the collector is run. It does not backfill the past because historical reconstruction proved too expensive and fragile for a reliable public dashboard. From now on, `npm run collect` records one real daily snapshot and updates that same date if it is run more than once.

The dashboard focuses only on portfolio-level metrics:

- Vault Value
- NAV
- Treasury Backing %
- Premium vs NAV
- Current Supply
- Market Price

It is not a vault-composition dashboard.

## Data Sources

| Metric | Source |
| --- | --- |
| Vault assets | Helius DAS `getAssetsByOwner` for the NUMMUS vault wallet |
| Vault asset prices | Jupiter, Helius `price_info`, DexScreener, DefiLlama |
| Supply | Helius RPC `getTokenSupply` for the NUMMUS mint |
| Market price | Same pricing cascade for the NUMMUS mint |

NFTs received by the vault are ignored automatically as spam/scam assets. Only fungible assets are valued.

If a fungible asset cannot be priced, the collector does not invent a value. It documents the asset under `valuationReport.unpricedAssets`, leaves `vaultUsd` as `null`, and derived metrics also remain `null`.

## Formulas

```text
NAV = vaultUsd / supply
Treasury Backing % = (NAV / marketPrice) * 100
Premium vs NAV = marketPrice / NAV
```

## Environment

Create `.env.local` for local collection:

```bash
cp .env.example .env.local
```

Then set:

```text
HELIUS_API_KEY=
```

Never hardcode the Helius key. Production should inject it through GitHub Secrets.

## Commands

```bash
npm install
npm run check
npm run collect
npm run build
```

`npm run collect` writes `data/history.json`.

Every run:

1. calculates current Vault Value USD;
2. reads current NUMMUS supply;
3. reads current NUMMUS market price;
4. calculates NAV, Treasury Backing, and Premium;
5. updates today's record if it already exists;
6. appends today's record if it does not exist.

## GitHub Actions

The workflow `.github/workflows/daily-snapshot.yml` runs once per day. It:

1. installs dependencies;
2. runs `npm run collect`;
3. runs `npm run build`;
4. commits `data/history.json` if it changed.

Add this repository secret before enabling the workflow:

```text
HELIUS_API_KEY
```

## Dashboard

The dashboard is a Vite app. It reads `data/history.json` and renders:

- KPI cards for the latest snapshot;
- NAV History;
- Treasury Backing History;
- Premium vs NAV History;
- Vault Value History;
- Supply History.

At the start there may be only one record. The charts become useful as the daily snapshot history grows.
