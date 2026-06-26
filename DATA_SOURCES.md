# NUMMUS Data Sources

This repository is the data engine for the official NUMMUS NAV / Treasury Backing dashboard. It is not a vault-composition dashboard.

Collectors must not invent or mock historical values. If a metric cannot be reconstructed reliably from Helius or another declared source, the value remains `null` and the limitation is documented here.

## Required Environment

The collector requires a Helius API key:

```text
HELIUS_API_KEY=
```

Local development uses `.env.local`, which is gitignored. Production should inject `HELIUS_API_KEY` through GitHub Secrets or the deployment platform. The key must not be hardcoded.

## Accounts

| Purpose | Address |
| --- | --- |
| NUMMUS mint | `9JK2U7aEkp3tWaFNuaJowWRgNys5DVaKGxWk73VT5ray` |
| Vault wallet | `HtT3yMsAavLQYmd6VSbXSdbAefyZUrrFeEPoTPivde3s` |
| Burn wallet | `5G62fW1BuK6k9B6sGwvTBtoKRPseshj9SSYPzudSPUYE` |

## Helius Endpoint Map

| Metric | Primary Endpoint | Historical or Current | Automatic Reconstruction | Current Collector Behavior |
| --- | --- | --- | --- | --- |
| Vault Value USD | Helius DAS `getAssetsByOwner` through `https://mainnet.helius-rpc.com/?api-key=...` | Current assets only | Not complete by itself | Validates current vault asset visibility; leaves `vaultUsd` null |
| Wallet Balances | Helius DAS `getAssetsByOwner` with `showFungible` and `showNativeBalance` | Current | Current balances only | Used as the vault discovery source, not displayed in the dashboard |
| Historical Balances | Helius Enhanced Transactions by wallet, or archive/indexed replay | Historical transaction stream | Possible only with full replay and valuation logic | Not implemented as vault USD because pricing and position decoding are still required |
| Burn History | Helius Enhanced Transactions `GET /v0/addresses/{burnWallet}/transactions` | Historical paginated transactions | Yes, if paginated through all burn-wallet history and validated | Extracts NUMMUS burn events from parsed transfers and raw balance changes |
| Supply | Helius RPC `getTokenSupply` | Current | Historical supply requires full mint/burn replay | Records current supply; does not fabricate historical supply |
| Market Price | Jupiter Price API v3, DexScreener fallback | Current | Helius is not a historical price source for NUMMUS | Records current market price only |
| NAV | Derived | Same date as source inputs | Yes after vault USD and supply exist | `null` until `vaultUsd` exists for the same date |
| Treasury Backing | Derived | Same date as source inputs | Yes after NAV and market price exist | `null` until NAV exists |
| Premium vs NAV | Derived | Same date as source inputs | Yes after NAV and market price exist | `null` until NAV exists |

## Verified Helius Behavior

Helius RPC `getTokenSupply` returns current NUMMUS supply:

```text
amount: 98152185149189
decimals: 6
uiAmount: 98152185.149189
```

Helius DAS `getAssetsByOwner` returns current vault-owned assets, including fungible token balances and native SOL valuation fields. This confirms Helius can discover current wallet balances, but it does not produce a canonical historical total USD value for the vault.

Helius Enhanced Transactions for the burn wallet returns parsed transaction history. A sampled burn transaction includes:

```text
fromUserAccount: 5G62fW1BuK6k9B6sGwvTBtoKRPseshj9SSYPzudSPUYE
toUserAccount: empty
mint: 9JK2U7aEkp3tWaFNuaJowWRgNys5DVaKGxWk73VT5ray
tokenAmount: 61351.378413
rawTokenAmount: -61351378413
decimals: 6
```

That makes burn-wallet burn events reconstructable from Helius without raw SPL instruction decoding in this repository.

## Vault Value USD

Helius is the correct primary source for discovering the current wallet asset set through DAS `getAssetsByOwner`.

Helius alone does not solve historical vault USD because a correct daily valuation requires:

- the asset set held by the vault on each historical date;
- balances for every token account on each date;
- decoding LP, staking, lending, escrow, or other position accounts if the vault uses them;
- same-date USD prices for every underlying asset;
- policy for unsupported or illiquid assets;
- reconciliation rules for stale or missing price data.

The current collector calls Helius DAS to verify current vault assets are available, then leaves `vaultUsd` null. This avoids presenting an incomplete native-SOL-only valuation as total vault value.

Future improvement:

1. Store raw Helius DAS snapshots daily.
2. Build a vault valuation service that prices only approved asset classes.
3. Backfill historical balances from Helius transaction history or an archival indexer.
4. Persist final daily `vaultUsd` values with source metadata.

## Supply

Current supply comes from Helius RPC `getTokenSupply`.

Historical supply is reconstructable only by replaying all token supply-changing events for the NUMMUS mint:

- mint instructions;
- burn instructions;
- any authority or migration event that changes the interpretation of supply.

The collector does not backfill historical supply from burn events alone because that would ignore possible mints and would create misleading values. A full implementation should page through Helius transaction history for the NUMMUS mint and classify every supply-changing instruction.

## Burn History

Burn history comes from Helius Enhanced Transactions:

```text
GET https://api.helius.xyz/v0/addresses/{burnWallet}/transactions?api-key=...
```

The collector extracts events where:

- the mint is the NUMMUS mint;
- `fromUserAccount` is the burn wallet;
- `toUserAccount` is empty;
- the matching raw token balance change is negative.

The local collector uses a bounded transaction limit for fast verification. Complete production burn history should paginate using the `before` cursor until no transactions remain, then persist raw transaction observations to avoid repeatedly rescanning old history.

Limitation:

If NUMMUS is burned outside the documented burn wallet, burn-wallet scanning will miss those events. A full mint-level burn scan is required for absolute burn history.

## Market Price

Helius is not used as the market price source because Helius does not provide the required historical NUMMUS daily price series.

Current market price uses:

- Jupiter Price API v3: `https://lite-api.jup.ag/price/v3?ids=<mint>`
- DexScreener token pairs fallback: `https://api.dexscreener.com/latest/dex/tokens/<mint>`

Historical market price still requires a candle or trade indexer. Recommended sources include Birdeye, GeckoTerminal, DexScreener chart access if available, or an internal daily snapshot process.

## Derived Metrics

Daily records in `data/history.json` use this schema:

```json
{
  "date": "",
  "vaultUsd": null,
  "supply": null,
  "marketPrice": null,
  "nav": null,
  "backing": null,
  "premium": null
}
```

Calculations:

```text
NAV = vaultUsd / supply
Backing = (NAV / marketPrice) * 100
Premium = marketPrice / NAV
```

Derived values remain `null` unless all required same-date inputs exist.

Burn events are stored separately in the same dataset under `burnEvents`.

## Recommended Production Architecture

Use a two-layer data model:

1. Raw observations: Helius DAS snapshots, Helius Enhanced Transactions, Helius RPC responses, price observations.
2. Normalized daily history: one record per date in `data/history.json` or a database table with the same schema.

Production jobs should:

- run daily after UTC day close;
- persist raw Helius responses with source timestamps;
- append new burn transactions using Helius pagination cursors;
- snapshot current supply using Helius RPC;
- calculate `vaultUsd` only after all asset balances and prices are available;
- keep the dashboard UI read-only against normalized history.
