# NUMMUS NAV Dashboard

Official daily NAV / Treasury Backing dashboard for NUMMUS.

This repository stores one real daily snapshot from the collector and updates that same date if it is run more than once. Historical vault USD records can also be imported from committed snapshots in `Nummus.VaultDAO`; those imported records are treated as historical snapshot data, not as live on-chain reconstruction.

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
npm run import:vault-history
npm run build
```

`npm run collect` writes today's raw snapshot to `data/snapshots/YYYY-MM-DD.json` and updates `data/history.json`.

Every run:

1. calculates current Vault Value USD;
2. reads current NUMMUS supply;
3. reads current NUMMUS market price;
4. calculates NAV, Treasury Backing, and Premium;
5. updates today's record if it already exists;
6. appends today's record if it does not exist.

`npm run import:vault-history` imports one daily Vault Value record from the local `Nummus.VaultDAO` Git history. It defaults to `../Nummus.VaultDAO`; set `VAULTDAO_REPO_PATH=/path/to/Nummus.VaultDAO` if the clone is elsewhere. The import keeps the last `data/prices.json` snapshot available for each day and merges those records into `data/history.json`.

## Data Layout

```text
data/
  history.json              Aggregated dashboard index.
  snapshots/YYYY-MM-DD.json Raw daily collector snapshot from today forward.
```

`data/history.json` is intentionally kept as the dashboard read model because GitHub Pages can load one file quickly. The cleaner source of truth for new daily collector output is the per-day file under `data/snapshots/`.

## GitHub Actions

The workflow `.github/workflows/daily-snapshot.yml` runs once per day at `06:00 UTC`, which is currently 08:00 in Italy during daylight saving time. It:

1. installs dependencies;
2. runs `npm run collect`;
3. runs `npm run build`;
4. commits `data/history.json` if it changed.
5. commits `data/snapshots/YYYY-MM-DD.json` if today's raw snapshot changed.

The workflow `.github/workflows/deploy-pages.yml` builds the dashboard and deploys `dist/` to GitHub Pages on every push to `main`.

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
- tBTC Accumulation.

Charts use a sticky global range selector (`1D`, `7D`, `30D`, `1Y`, `ALL`) and interactive hover tooltips with crosshairs and axis labels.

Supply History in the dashboard uses burn-derived historical supply points plus daily collector snapshots from today forward. The tooltip shows only date and supply.

At the start there may be only one record. The charts become useful as the daily snapshot history grows.
