# NUMMUS Data Sources

This repository is the data engine for the official NUMMUS NAV / Treasury Backing dashboard. It is not a vault-composition dashboard.

Collectors must not invent or mock historical values. If a metric cannot be reconstructed reliably from Realms, Helius, Shyft, or another declared source, the value remains `null` and the limitation is documented here.

## Required Environment

The current collector requires a Helius API key:

```text
HELIUS_API_KEY=
```

Local development uses `.env.local`, which is gitignored. Production should inject `HELIUS_API_KEY` through GitHub Secrets or the deployment platform. The key must not be hardcoded.

If the collector is later moved to Shyft GraphQL for Realms indexing, add a separate `SHYFT_API_KEY` secret. Do not reuse or overload `HELIUS_API_KEY`.

## On-Chain References

| Purpose | Address |
| --- | --- |
| Realms DAO / Realm | `2Czvw7p29thfqNJznuicygBKxh33xoCMuGMH7zbPQ2gp` |
| SPL Governance program | `GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw` |
| NUMMUS mint | `9JK2U7aEkp3tWaFNuaJowWRgNys5DVaKGxWk73VT5ray` |
| Legacy vault wallet reference | `HtT3yMsAavLQYmd6VSbXSdbAefyZUrrFeEPoTPivde3s` |
| Burn wallet | `5G62fW1BuK6k9B6sGwvTBtoKRPseshj9SSYPzudSPUYE` |

The legacy vault wallet must no longer be treated as the starting point for treasury discovery. The treasury source of truth is the Realms DAO.

## Realms Treasury Model

Realms is built on SPL Governance. In SPL Governance, a DAO is represented by a `Realm` account. A realm can have multiple `Governance` accounts, and each governance has a native treasury PDA derived from:

```text
['native-treasury', governance]
```

Realms documentation describes treasury accounts as shared DAO wallets that can hold SPL and Token-2022 assets. Anyone can deposit into treasury accounts, but withdrawals are controlled through DAO proposals and executed by governance authority after approval.

Important implication: there is not necessarily one single vault wallet. A DAO can have multiple governance accounts and therefore multiple native treasury wallets. The correct collector should:

1. start from the realm address;
2. enumerate all governance accounts for that realm;
3. derive each governance native treasury PDA;
4. read assets held by each treasury wallet;
5. value those assets according to a separate pricing policy.

Sources:

- Realms Treasury docs: `https://docs.realms.today/realms-v2/features/treasury.md`
- Realms API docs: `https://docs.realms.today/developer-resources/api.md`
- Realms SPL Governance docs: `https://docs.realms.today/developer-resources/spl-governance.md`
- SPL Governance README: `https://github.com/Mythic-Project/solana-program-library/tree/master/governance`

## Realms API and SDK Findings

### Official Realms API

Realms documents a gated API. Access requires a Realms-provided API key and plan.

Documented endpoints:

- `GET /api/v1/daos`
- `GET /api/v1/daos/:realmPk`
- `POST /api/v1/daos/create`
- `GET /api/v1/user/:walletPk`
- `GET /api/v1/leaderboard`

The public docs do not list endpoints for:

- treasury balances;
- treasury assets;
- historical treasury balances;
- historical treasury USD value;
- NAV-style metrics.

The GitBook documentation's own `ask` endpoint confirms that no Realms API or SDK endpoint is documented for historical treasury value or historical treasury asset balances. Current treasury balance is accessible through on-chain account queries.

### Realms SDK

Realms documents:

- `governance-idl-sdk`
- `@solana/spl-governance`
- source repository: `https://github.com/Mythic-Project/governance-sdk`

The SDKs are useful for decoding Realm, Governance, Proposal, NativeTreasury, and related SPL Governance accounts. They do not provide historical USD treasury valuation by themselves.

### Direct On-Chain Access

Realms docs explicitly allow direct access without an API key through Solana RPC or an indexer. Relevant account types include:

| Account Type | Use |
| --- | --- |
| `Realm` | DAO root account |
| `Governance` | Governance config and seed for treasury PDA |
| `NativeTreasury` | DAO SOL wallet PDA derived from governance |
| `Proposal` | Vote/proposal state |
| `ProposalTransaction` | Executable proposal instructions |

Direct RPC can recover current governance structure. Historical balances still require replaying transactions or using an archival/indexed provider.

## Shyft / External Indexer Findings

Shyft has a documented Realms/Governance indexer:

- Overview: `https://docs.shyft.to/solana-indexers/case-studies/solana-governance-realms.md`
- DAO treasury example: `https://docs.shyft.to/solana-indexers/case-studies/solana-governance-realms/get-dao-treasury-info.md`

Shyft's recommended approach:

1. Query governance accounts for a realm through Shyft GraphQL.
2. Derive treasury wallets from governance public keys using the SPL Governance native treasury PDA seed.
3. Fetch holdings for those treasury wallets using wallet APIs.

The example GraphQL tables are:

- `GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw_GovernanceV1`
- `GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw_GovernanceV2`

Shyft's current treasury example uses `get_portfolio`, but their wallet docs mark `get_portfolio` as deprecated. If Shyft is selected, use the GraphQL governance index for DAO discovery, then prefer non-deprecated wallet/token endpoints or Helius DAS for current treasury assets.

Shyft appears to be the best documented external provider for Realms-specific indexing. It still does not document a precomputed historical USD treasury value time series.

## Metric Source Plan

| Metric | Recommended Source | Historical or Current | Can Be Reconstructed Automatically? | Notes |
| --- | --- | --- | --- | --- |
| Treasury accounts | Realms/SPL Governance via SDK or Shyft GraphQL | Current governance structure | Yes | Start from realm, enumerate governances, derive native treasury PDAs |
| Treasury assets | Helius DAS `getAssetsByOwner` for each derived treasury wallet | Current | Yes for current holdings | Must aggregate across all DAO treasury wallets |
| Historical treasury balances | Helius Enhanced Transactions, Shyft transaction/indexer data, or archival RPC replay | Historical | Yes, with full replay and storage | Requires transaction-level reconstruction for every derived treasury wallet |
| Historical treasury prices | Jupiter current prices, Helius asset `price_info`, DexScreener, DefiLlama Coins, plus a historical candle provider for backfill | Current now; historical after backfill provider is added | Partially | Current treasury fungible assets are priced through the provider cascade; historical pricing still needs same-date provider coverage |
| Historical treasury USD value | Internal valuation service using historical balances + historical prices | Historical | Yes only when every fungible treasury asset is priced | Requires pricing all fungible assets by date and decoding positions; ignore spam/scam NFTs; leave `vaultUsd` null if any fungible asset is unpriced |
| Supply | Helius RPC `getTokenSupply` for current; mint/burn replay for history | Current + reconstructable historical | Yes with full mint-level replay | Do not infer supply from burn events alone |
| Burn history | Helius Enhanced Transactions for burn wallet | Historical paginated | Yes if all burn-wallet history is paginated | Also run a mint-level burn audit later |
| Market price | Jupiter/DexScreener current; candle/trade provider for history | Current unless paid/indexed history is added | Yes with a price indexer | Helius/Realms do not provide historical NUMMUS market candles |
| NAV | Derived | Same date as source inputs | Yes after vaultUsd and supply exist | `vaultUsd / supply` |
| Treasury Backing | Derived | Same date as source inputs | Yes after NAV and market price exist | `(NAV / marketPrice) * 100` |
| Premium vs NAV | Derived | Same date as source inputs | Yes after market price and NAV exist | `marketPrice / NAV` |

## What Can Be Obtained From Realms Today

Available:

- DAO/Realm identity.
- Governance accounts for the realm.
- Native treasury PDA for each governance.
- Current treasury wallet addresses.
- Proposal and proposal transaction data.
- Current balances if the treasury wallet addresses are passed to wallet/token APIs.

Not available as documented public Realms data:

- historical treasury USD value;
- historical treasury asset balances as a ready-made time series;
- precomputed NAV/backing/premium metrics;
- canonical price policy for treasury assets.

## Historical Treasury Value Assessment

Starting from Realms is structurally better than starting from a single wallet because it identifies all DAO-controlled treasury wallets instead of assuming one hardcoded vault address.

However, it does not remove the hard part of NAV:

- Realms identifies authority and treasury accounts.
- Realms does not provide a historical USD valuation ledger.
- Treasury wallets can hold arbitrary SPL/Token-2022 assets and potentially positions that require protocol-specific decoding.
- A historical NAV series still requires daily balance reconstruction and historical prices.

Therefore, the correct conclusion is:

```text
Realms improves treasury discovery.
Realms does not directly solve historical vaultUsd.
```

## Daily Snapshot Valuation Assessment

The preferred architecture is not to ask a provider for "historical treasury USD value". The preferred architecture is:

1. discover DAO treasury wallets from Realms;
2. snapshot all treasury assets for each day;
3. fetch same-day USD prices for each asset;
4. calculate `vaultUsd` internally;
5. store only the daily portfolio-level output used by the NAV dashboard.

### Is it technically feasible?

Yes for current and future daily snapshots.

The current collector implements the start of this architecture:

- `collectRealmTreasuries` uses `@solana/spl-governance` and Helius RPC to enumerate governances for realm `2Czvw7p29thfqNJznuicygBKxh33xoCMuGMH7zbPQ2gp`.
- The discovered governance currently derives native treasury PDA `HtT3yMsAavLQYmd6VSbXSdbAefyZUrrFeEPoTPivde3s`.
- `collectVaultHistory` reads current assets for every discovered treasury using Helius DAS `getAssetsByOwner`.
- The collector prices fungible Solana assets through Jupiter first, then Helius asset `price_info`, then DexScreener, then DefiLlama.
- Non-fungible spam/scam assets are ignored and do not block `vaultUsd`.
- If any fungible treasury asset cannot be priced, the output `vaultUsd` is left `null`.

Yes, with more engineering, for historical backfill.

Historical backfill cannot be done with Helius DAS alone because DAS returns current assets, not "assets as of date X". A reliable backfill must replay historical activity for every discovered treasury wallet, reconstruct end-of-day balances, and then price those balances using a historical price provider.

### Reliability

High reliability:

- Realms treasury discovery from SPL Governance accounts.
- Current native SOL and fungible token balances from Helius DAS.
- Historical prices for liquid assets covered by the selected price provider.

Medium reliability:

- Historical SPL token balances reconstructed from full transaction replay. This is feasible, but the implementation must handle token account creation, closing, transfers, burns, mints, decimals, Token-2022, native SOL lamport changes, and pagination completeness.
- Historical prices for smaller Solana assets. Coverage varies by provider and date.

Low reliability without a declared policy:

- LP tokens.
- staking/escrow/vesting positions.
- illiquid tokens with no reliable market price.
- assets whose market price exists today but not for earlier dates.

The current treasury asset test showed why provider priority matters: PUNCHY is not priced by DefiLlama or DexScreener, but Jupiter returns a valid market price. The two current treasury NFTs are ignored because they are spam/scam receipts and are not DAO assets.

### Computational Cost

Future daily snapshots are cheap:

- one Realms governance query;
- one Helius DAS `getAssetsByOwner` request per treasury wallet;
- price requests for fungible assets through the priority cascade, stopping at the first valid provider;
- one append/update to the stored daily dataset.

Historical backfill is more expensive but bounded:

- `O(number_of_treasury_transactions)` to reconstruct balances;
- `O(number_of_dates * number_of_assets_per_day)` for pricing, usually reduced through batching and caching;
- additional protocol-specific decoding if treasury assets include LP/staked/escrowed positions.

For this DAO, current Realms discovery returns one native treasury, so the first backfill should be manageable. The cost can grow if the DAO later adds more governances/treasuries or actively trades many assets.

### APIs Required

Minimum architecture:

- Helius RPC: read SPL Governance accounts through `@solana/spl-governance`.
- Helius DAS `getAssetsByOwner`: current treasury asset snapshot.
- Helius Enhanced Transactions or an archival/indexed Solana transaction source: historical treasury transaction replay.
- Jupiter Price API: first current-price source for fungible assets.
- Helius DAS `token_info.price_info`: second current-price source when present.
- DexScreener token pairs: third current-price source.
- DefiLlama Coins: fourth current-price source and useful historical price source for supported fungible assets.
- A historical candle provider, likely Birdeye, GeckoTerminal, CoinGecko, or a retained internal snapshot store: required for complete historical backfill where current-only APIs are insufficient.

Optional:

- Shyft GraphQL Realms/Governance indexer for faster Realms account discovery and query ergonomics.
- Internal raw snapshot storage so future backfills are reproducible without repeatedly re-querying all providers.

### One-Time Backfill + Daily Maintenance

This is the recommended operating model.

One-time backfill:

1. discover all treasury wallets from Realms;
2. fetch all historical transactions for each treasury;
3. replay balance changes into end-of-day balances;
4. price every asset on every day;
5. write `date, vaultUsd` records only where fungible valuation coverage is complete;
6. persist raw replay state and pricing coverage diagnostics.

Daily maintenance:

1. run treasury discovery;
2. fetch current treasury assets;
3. fetch current prices;
4. append today's `vaultUsd` if fungible coverage is complete;
5. leave today's `vaultUsd` as `null` and emit warnings if any fungible asset is unpriced.

This avoids dependency on a provider exposing direct historical treasury value, while still relying on providers for raw chain data and market prices.

## Recommended Architecture

Use a Realms-first treasury discovery layer:

1. `collectRealmTreasuries`
   - Input: realm address `2Czvw7p29thfqNJznuicygBKxh33xoCMuGMH7zbPQ2gp`.
   - Query governance accounts via Shyft GraphQL or Realms SDK + Helius RPC.
   - Derive native treasury PDA for each governance.
   - Persist the list of treasury wallet addresses with governance metadata.

2. `collectTreasuryCurrentAssets`
   - For each derived treasury wallet, fetch current assets through Helius DAS `getAssetsByOwner` or Shyft wallet/token APIs.
   - Store raw observations.
   - Do not expose composition in the dashboard UI.

3. `collectTreasuryBalanceHistory`
   - Replay transactions for each derived treasury wallet.
   - Reconstruct daily token balances.
   - Treat this as a backfill job, not a browser/UI concern.

4. `valueTreasuryHistory`
   - Price daily balances using a declared historical price provider.
   - Apply explicit exclusions or manual-review flags for unsupported assets.
   - Output only daily `vaultUsd`.

5. `buildHistory`
   - Join `vaultUsd`, supply, market price, and burn history by date.
   - Calculate NAV, backing, and premium only when same-date inputs exist.

Recommended provider choice:

- Keep Helius as the primary Solana RPC/enhanced transaction/DAS provider for Realms discovery, current assets, and generic transaction history.
- Use Jupiter, Helius `price_info`, DexScreener, then DefiLlama for current fungible treasury pricing.
- Add a historical candle provider before enabling historical Vault USD as a production KPI.
- Use Shyft GraphQL for Realms-specific indexing only if Helius/SPL Governance discovery becomes too slow or if Shyft provides useful indexed historical transaction tables for treasury replay.
- Do not use the old hardcoded vault wallet as the root of treasury discovery.

## Implementation Decision

The collector now implements Realms-first discovery instead of starting from the previous vault wallet constant.

Current implementation status:

- `collector/collectRealmTreasuries.ts` discovers DAO-controlled native treasury PDAs from the Realms realm.
- `collector/collectVaultHistory.ts` aggregates current treasury assets across discovered treasuries.
- `src/utils/treasuryPricing.ts` prices fungible treasury assets using Jupiter, Helius asset `price_info`, DexScreener, then DefiLlama.
- `src/utils/defillama.ts` provides DefiLlama current and historical price lookups for fungible Solana assets by `solana:<mint>`.
- Non-fungible assets are ignored as spam/scam treasury receipts and do not block `vaultUsd`.
- `vaultUsd` is emitted only if all current fungible treasury assets can be valued by the declared pricing policy.

The historical transaction replay layer is not implemented yet. Until it exists, historical `vaultUsd` records must remain `null`.

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
