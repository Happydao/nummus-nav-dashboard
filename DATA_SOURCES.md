# NUMMUS Dashboard Data Sources

## Current daily snapshots

| Metric | Source | Calculation |
| --- | --- | --- |
| Vault assets | Helius DAS `getAssetsByOwner` for the Vault wallet | Current fungible balances only; NFTs are ignored |
| Vault asset prices | Jupiter, Helius `price_info`, DexScreener, DefiLlama | First valid provider wins |
| NUMMUS supply | Helius RPC `getTokenSupply` | Current mint supply |
| NUMMUS market price | Current pricing cascade | Current USD market price |
| NAV | Derived | `vaultUsd / supply` |
| Treasury Backing | Derived | `(NAV / marketPrice) * 100` |
| Premium | Derived | `marketPrice / NAV` |

The daily collector writes `data/snapshots/YYYY-MM-DD.json` and upserts the same date in `data/history.json`.

## Early Vault reconstruction

The Vault account was created at `2025-06-16T10:49:39Z`. The bounded command `npm run import:early-vault` reconstructs end-of-day balances from 16 June through 4 December 2025.

### Balances

- Helius enhanced transaction history is paginated for the Vault wallet.
- Native SOL is replayed from `nativeBalanceChange`.
- SPL balances are replayed from token balance changes owned by the Vault.
- tBTC uses the existing transaction-derived tBTC history, carried forward between real balance changes.
- NFT and unrelated Realms governance balances are excluded.

### Historical prices

| Asset | Historical source |
| --- | --- |
| SOL | DefiLlama daily chart |
| NUMMUS | DefiLlama daily chart |
| tBTC | DefiLlama daily chart for the Solana tBTC mint |
| PISTA legacy mint (BUMPER) | DefiLlama daily chart and first historical observation |
| MOONPUMP | GeckoTerminal daily OHLCV close |
| PUNCHY | Last real daily PUNCHY/SOL pool trade from Helius, converted with DefiLlama SOL/USD |

No price is interpolated. When a provider has no new observation on a trading day, the importer uses the latest earlier real close. A date before the first public price for a held asset remains incomplete: `vaultUsd` is `null` and the asset is documented in `valuationReport.unpricedAssets`.

The reconstruction adds 172 dates. At the time of import, 162 are complete and 10 are incomplete:

- 16-22 June 2025: no verifiable NUMMUS price on or before those dates;
- 30 July-1 August 2025: BUMPER was held before its first verifiable public price.

Supply, NUMMUS market price, NAV, backing, and premium remain `null` for these imported early records because this command is scoped specifically to historical Vault Value. It does not claim to reconstruct a complete historical dashboard snapshot.

## Existing history from 5 December 2025

Records beginning 5 December 2025 were imported from committed `data/prices.json` snapshots in `Nummus.VaultDAO`. They are independent historical observations and are not overwritten by the early importer.

The boundary is intentionally not smoothed. The reconstructed 4 December value and the recorded 5 December value can differ because each uses the real price observations available for its own day.

## Limitations and recommended architecture

- Helius reconstructs balances and transfers, not historical USD prices.
- Thinly traded assets can retain a stale last-observed close until another market trade occurs.
- Dates before an asset's first market price cannot be valued without inventing a price.
- `data/history.json` remains the dashboard read model; raw daily snapshots remain the source of truth from the live collector start date onward.
- Historical imports should stay bounded, cached, manually invoked, and separate from the daily GitHub Action.
