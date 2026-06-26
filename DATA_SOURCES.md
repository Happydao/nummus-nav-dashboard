# NUMMUS Data Sources

This document defines the data architecture for the official NUMMUS NAV / Treasury Backing dashboard.

The project must not invent or mock historical values. When a metric cannot be reconstructed reliably from public data, collectors must return `null` values and warnings.

## Accounts

| Purpose | Address |
| --- | --- |
| NUMMUS mint | `9JK2U7aEkp3tWaFNuaJowWRgNys5DVaKGxWk73VT5ray` |
| Vault wallet | `HtT3yMsAavLQYmd6VSbXSdbAefyZUrrFeEPoTPivde3s` |
| Burn wallet | `5G62fW1BuK6k9B6sGwvTBtoKRPseshj9SSYPzudSPUYE` |

## Metric Sources

| Metric | Source | Current Availability | Historical Reconstruction |
| --- | --- | --- | --- |
| Vault Value USD | Vault wallet plus full valuation engine | Not reliably available from one public RPC call | Not reliable from wallet address alone |
| Supply | Solana RPC `getTokenSupply` for current supply | Available | Requires full mint/burn replay from genesis using archival RPC/indexer |
| Burn events | Solana RPC `getSignaturesForAddress` and `getTransaction` on burn wallet | Available for recent/paginated history | Reconstructable if all burn-wallet signatures remain available through archival infrastructure |
| Market Price | Jupiter Price API or DexScreener token pairs | Current price available | Needs historical candles/trades from a price indexer |
| NAV | Derived | Blocked until vault USD and supply exist for same date | Derived only after source data is complete |
| Treasury Backing | Derived | Blocked until NAV and market price exist for same date | Derived only after source data is complete |
| Premium vs NAV | Derived | Blocked until market price and NAV exist for same date | Derived only after source data is complete |

## Verified Public Data

Public Solana RPC returned current NUMMUS supply via `getTokenSupply`:

```text
amount: 98152185149189
decimals: 6
uiAmount: 98152185.149189
```

Public Solana RPC returned recent burn-wallet signatures via `getSignaturesForAddress`.

A sampled burn-wallet transaction contained a parsed SPL-token `burn` inner instruction for the NUMMUS mint:

```text
amount: 61351378413
decimals: 6
ui amount: 61351.378413 NUMMUS
```

Public price endpoints returned current NUMMUS prices:

- Jupiter Price API v3 returned a current USD price for the NUMMUS mint.
- DexScreener returned current NUMMUS pairs on Raydium, Meteora, Orca, and PumpSwap.

CoinGecko search did not return a listed NUMMUS coin for the mint address at the time of investigation, so CoinGecko cannot currently be treated as the canonical historical price source.

## Vault Value USD

Historical vault USD is the hardest metric and cannot be reconstructed reliably from the vault wallet address alone.

A correct valuation requires all of the following for every historical date:

- all token accounts owned by the vault at that date;
- historical balances for those token accounts;
- decoded LP, staking, lending, or other position accounts if the vault holds non-wallet positions;
- historical USD prices for every underlying asset;
- a pricing policy for illiquid or unsupported assets;
- a reconciliation policy for missing or stale prices.

Standard Solana RPC can return current token accounts and balances. It does not provide a simple canonical daily historical wallet valuation. Rebuilding this from raw chain data requires an archival RPC/indexer and a valuation engine.

Recommended approach:

1. Create a dedicated vault valuation service that snapshots the vault daily.
2. Store immutable daily records with source metadata.
3. Backfill only from archival/indexed data where every asset balance and price can be reproduced.
4. Keep vault composition out of this dashboard; expose only the final daily `vaultUsd` value and provenance.

## Supply

Current supply is available from Solana RPC `getTokenSupply`.

Historical supply can be reconstructed by replaying all mint and burn instructions involving the NUMMUS mint. This requires complete transaction history from an archival RPC or indexer. A non-archival endpoint may omit old transactions or rate-limit deep pagination.

Collector status:

- `collector/collectSupplyHistory.ts` records the current supply snapshot.
- It does not claim full historical supply until instruction replay is implemented with archival coverage.

## Burn History

Burn events are reconstructable because the burn wallet receives NUMMUS and immediately burns it. Recent public RPC data confirms burn transactions include parsed SPL-token `burn` inner instructions for the NUMMUS mint.

Collector status:

- `collector/collectBurnHistory.ts` scans burn-wallet signatures.
- For each transaction, it extracts parsed SPL-token `burn` instructions where `mint` equals the NUMMUS mint.
- The default limit is intentionally bounded at 10 signatures for local verification. Full history requires pagination using the `before` cursor until no signatures remain, preferably against an archival/indexed provider.

Known limitation:

If burns ever occur outside the documented burn wallet, burn-wallet scanning will miss them. A full mint-level scan is needed for absolute total burn history.

## Market Price

Current market price is available from:

- Jupiter Price API v3: `https://lite-api.jup.ag/price/v3?ids=<mint>`
- DexScreener token pairs: `https://api.dexscreener.com/latest/dex/tokens/<mint>`

These endpoints are useful for current pricing but are not a complete historical price source.

Historical market price requires one of:

- a paid or public candle API that supports NUMMUS pairs;
- a DEX trade indexer with swap-level history;
- a daily internal snapshot process started now and retained permanently.

Recommended pricing policy:

1. Prefer a liquid USD or stablecoin pair if available.
2. Otherwise use the most liquid SOL pair converted with the same timestamp's SOL/USD price.
3. Store the pair address, source API, timestamp, and liquidity.
4. Do not merge prices from multiple sources without recording precedence.

## Derived Metrics

The dashboard derives metrics only when same-date inputs exist:

```text
NAV = vaultUsd / supply
Treasury Backing = nav / marketPrice * 100
Premium = marketPrice / nav
```

If `vaultUsd`, `supply`, or `marketPrice` is missing for a date, derived values remain `null`.

## Public APIs Required

Minimum current implementation:

- Solana JSON-RPC endpoint, defaulting to `https://api.mainnet-beta.solana.com`
- Jupiter Price API v3 for current market price
- DexScreener token endpoint as a current-price fallback

Recommended production implementation:

- archival Solana RPC or indexer for full token instruction history;
- historical DEX candle/trade API for NUMMUS market price;
- vault valuation service with daily immutable snapshots;
- durable storage for raw source observations and final daily normalized records.

## Architecture Going Forward

Use a two-layer data model:

1. Raw observations: signatures, transactions, token balances, price candles, valuation snapshots.
2. Normalized daily history: one record per date in `data/history.json`.

Collectors should be idempotent and append/reconcile raw observations before building the daily dataset. The UI should read only normalized history and should never contain data-fetching logic for reconstruction.

The first dashboard page should show KPIs and charts only after enough validated history exists:

- Vault Value
- NAV
- Treasury Backing
- Premium vs NAV
- Current Supply
- NAV History
- Treasury Backing History
- Premium History
- Supply History
- Burn History
