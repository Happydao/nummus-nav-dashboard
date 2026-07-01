# NUMMUS NAV Dashboard

The NUMMUS NAV Dashboard tracks the treasury backing, market valuation and liquidity conditions supporting NUMMUS over time.

It is not primarily a treasury-composition dashboard. Current asset holdings are available as supporting context, while the dashboard's main purpose is to preserve and explain the historical relationship between:

- the treasury's total USD value and its drawdown from previous peaks;
- the circulating NUMMUS supply and its reduction through verified burns;
- NAV, the treasury value attributable to each token;
- the NUMMUS market price, Treasury Backing and the market premium over NAV;
- the quantity of tBTC accumulated by the treasury;
- the buy-side and sell-side market depth available through Jupiter routes;
- the total and per-pool DEX liquidity reported for NUMMUS markets.
- the growth of unique NUMMUS holder wallets.

The historical dashboard is complemented by a separate projection simulator. The simulator combines the latest verified Vault Value and supply with explicit treasury-growth, burn-rate and premium assumptions. Its results are hypothetical scenarios, not historical observations or price forecasts.

Current data is recorded through recurring complete snapshots and retained to build a verifiable historical series. A snapshot is accepted only when every required metric is available and valid, keeping all charts aligned to the same observation date.

## Core Metrics

### Vault Value

Vault Value is the total USD value of the fungible assets included in the DAO treasury valuation.

It can change because assets enter or leave the treasury, but also because the market prices of assets already held by the treasury change. A higher Vault Value does not therefore necessarily mean that an equivalent amount of new capital was deposited.

### NAV

Net Asset Value, or NAV, is the treasury value attributable to each NUMMUS in circulation.

```text
NAV = Vault Value USD / NUMMUS Supply
```

At otherwise equal conditions, NAV increases when the treasury grows or the supply decreases. NAV is an accounting indicator: it is not a redemption guarantee and does not require the market to trade NUMMUS at the same price.

### Treasury Backing

Treasury Backing compares NAV with the NUMMUS market price.

```text
Treasury Backing % = (NAV / NUMMUS Price) x 100
```

- `100%` means NAV and market price are equal;
- below `100%` means NUMMUS trades above its NAV;
- above `100%` means NAV is greater than the market price.

Moving closer to `100%` means that market price and treasury value per token are converging. Treasury Backing is an analytical ratio, not a promise that holders can redeem tokens against the treasury.

### Premium vs NAV

Premium measures how many times the market price exceeds NAV.

```text
Premium = NUMMUS Price / NAV
```

A premium of `1x` means market price and NAV are equal. A value of `10x` means the market values NUMMUS at ten times its NAV.

Premium reflects market expectations, demand, liquidity and sentiment. A high premium can identify a strong speculative or high-demand phase, but it is not automatically positive or negative.

## Historical Charts

### NAV vs NUMMUS Price

This chart compares the evolution of NAV with the NUMMUS market price.

The green NAV series uses the left Y-axis. The orange NUMMUS Price series uses the right Y-axis. Both series share the same time axis, but their vertical scales are independent so that NAV remains readable even when the market price is much higher or more volatile.

Because the scales are independent, the visual distance between the lines and any apparent crossing point do not measure the actual difference between NAV and price. Treasury Backing and Premium vs NAV provide that comparison mathematically.

### Treasury Backing History

This chart shows what percentage of the NUMMUS market price was represented by NAV on each date.

A rising value means NAV is covering a larger portion of the market price. A falling value means the price is moving further above NAV, or that NAV is falling faster than the price. The chart therefore combines changes in treasury value, supply and market price.

### Premium vs NAV History

This chart shows the historical market-price multiple over NAV.

Values close to `1x` identify periods in which market price and treasury value per token were similar. Higher values identify periods in which the market assigned NUMMUS a larger premium, potentially because of expectations, demand or market enthusiasm.

### Vault Value History

This chart shows the total USD value of the fungible treasury assets over time.

Its movement reflects both blockchain balance changes and market-price changes. The treasury may therefore gain or lose USD value even when no asset is transferred.

The comparable financial series displayed by the dashboard begins on **1 September 2025**. This common starting date excludes the treasury's initial formation and early price-discovery phase, when exceptional asset valuations would distort NAV, backing and premium comparisons.

### Vault Drawdown

Vault Drawdown measures how far the Vault Value is below the highest value it had previously reached. It is derived entirely from Vault Value History and uses the same starting date of **1 September 2025**.

```text
Historical Peak = Highest Vault Value recorded up to that date
Vault Drawdown % = ((Vault Value / Historical Peak) - 1) x 100
```

A value of `0%` means the vault is at a new historical high. A value of `-20%` means the current Vault Value is 20% below its previous peak. When the vault partially recovers, drawdown moves back toward zero; when it exceeds the earlier peak, drawdown returns to zero and a new peak is established.

The line remains green while drawdown is above `-40%`. It turns red below `-40%` to highlight a critical contraction from the historical peak. The muted grey-green area provides visual context without treating every ordinary drawdown as an alarm.

Unlike the percentage shown above Vault Value History, which compares the beginning and end of the currently selected range, drawdown always compares each observation with the highest value recorded before or on that date. It therefore measures the depth and duration of treasury contractions rather than ordinary period performance.

### Supply Reduction

This chart tracks the reduction of NUMMUS supply from the initial `100,000,000` tokens.

The series begins on **27 June 2025**, remains at 100 million until the first verified burn and then follows the supply changes derived from burn activity and subsequent snapshots. A lower supply increases NAV when Vault Value remains unchanged.

### tBTC Accumulation

This chart tracks the amount of tBTC held by the treasury, not its USD value.

An upward movement means additional tBTC entered the treasury. A flat section means the quantity remained unchanged. Changes in the Bitcoin price do not alter this chart because it measures token units rather than their market value.

### NUMMUS Market Depth

This chart estimates how much NUMMUS can be bought or sold through the routes currently available to Jupiter before the quoted price impact exceeds `1%`.

- **Buy Depth** is the maximum USDC notional that can be exchanged for NUMMUS within the impact threshold.
- **Sell Depth** is the USD notional of NUMMUS that can be exchanged for USDC within the same threshold.

Higher depth means that the market can generally absorb a larger trade without moving the quoted price beyond the selected limit. Similar buy and sell depth indicates more balanced execution conditions, while a large difference can reveal asymmetric routing or available liquidity.

The collector discovers each threshold through progressively larger Jupiter quotes followed by a binary search around the limit. It uses Jupiter's API `priceImpactPct` field as the common technical threshold and reflects all routes returned by Jupiter rather than the reported TVL of a single pool.

The API price-impact percentage is not necessarily identical to the total value difference displayed by the Jupiter interface. The interface may also reflect its current USD reference prices, pool fees, route composition and price changes between observations. Market Depth should therefore be read as a standardized liquidity measurement, not as a guaranteed net execution result.

Each value is an instantaneous quote observation. Available routes, pool state and execution conditions can change before a transaction is submitted, and no swap is executed by the collector.

Historical Jupiter quotes cannot be reconstructed reliably. This series therefore begins with the first daily market-depth snapshot and does not backfill earlier dates.

### NUMMUS DEX Liquidity

This chart tracks the combined USD liquidity reported across the Solana liquidity pools that contain NUMMUS. It begins with the first collected liquidity snapshot and does not use reconstructed historical values.

For every daily snapshot, the collector requests the list of NUMMUS pairs from DexScreener, verifies that NUMMUS is one side of each pair, removes duplicate pair addresses and stores the valid `liquidity.usd` value of every pool. It also stores their sum as Total DEX Liquidity. These values represent capital deposited in pools, not trading volume, market capitalization or treasury value.

The historical chart displays only Total DEX Liquidity on a linear USD scale with an adaptive upper margin. This keeps the trend directly comparable with the dashboard's other financial charts and prevents very small pools from distorting the axis. The tooltip reports the exact total for each observation.

The `pools tracked` control reports the latest available USD liquidity for every detected pool, including residual pools with very small balances. Each pool is identified by DEX, token pair and an abbreviated address where required. Individual pool values remain available for transparency but are not drawn as historical lines.

Higher DEX Liquidity generally means that more capital is available to support trading. It does not, however, reveal how that liquidity is distributed across prices. Concentrated-liquidity pools can report substantial total liquidity while offering less executable liquidity near the current price. For this reason, DEX Liquidity should be evaluated together with NUMMUS Market Depth.

DexScreener values are current indexed observations supplied by a third party. A snapshot can change as pool balances, token prices or DexScreener indexing change.

### Holder Distribution

Holder Distribution combines holder growth and ownership concentration in one historical chart with a shared date axis, range selection, zoom, crosshair and tooltip. The two measurements use independent Y-axes because wallet count and ownership percentage are different units and must not be compared on one numerical scale.

#### Unique Holder Wallets

The green line uses the adaptive left axis and counts unique wallet owners with a positive NUMMUS balance, regardless of the quantity held. Multiple SPL token accounts controlled by the same wallet are aggregated and counted as one holder, preventing account structure from artificially inflating the result. The adaptive axis preserves the visibility of changes as the holder count evolves; its vertical position must be read against the left-axis values, not against the percentage areas behind it.

The tooltip reports total, new and exited holder wallets. New and exited values compare each observation with the preceding daily snapshot: a new holder had no positive balance in the baseline snapshot, while an exited holder no longer has a positive balance. Multiple collector runs on the same date continue to use the preceding date as their baseline, so an intraday refresh does not reset the daily change to zero.

Holder count includes every owner returned for the NUMMUS mint, including treasury, burn, pool and other technical owners when they have a positive balance. It measures wallet addresses rather than verified people or institutions: one entity can control several wallets, while a custodian or protocol can represent multiple underlying users.

#### Ownership Concentration

The stacked areas use the fixed right `0–100%` axis and measure how the adjusted NUMMUS balance is distributed. Before ranking, all token accounts belonging to the same owner are aggregated. The chart divides ownership into four mutually exclusive groups:

- the largest single holder;
- holders ranked from 2 through 10;
- holders ranked from 11 through 50;
- all holders outside the Top 50.

These four areas always sum to 100%. Above the chart, Unique Holder Wallets, Largest Holder, cumulative Top 10, cumulative Top 50 and Outside Top 50 are presented with their changes over the selected period. The areas themselves are exclusive, while the Top 10 and Top 50 headline values are cumulative.

Broader distribution generally appears as a declining Largest Holder, Top 10 and Top 50 share together with a growing Outside Top 50 share. The opposite movement indicates increasing concentration. This is descriptive rather than a guarantee of decentralization because several wallets can belong to one beneficial owner and custodial wallets can represent many users.

Concentration is calculated against the adjusted holder set. Verified NUMMUS owners used by tracked DEX pools are excluded because pooled liquidity represents protocol custody supplied by multiple participants and should not be interpreted as an individual whale. Known project operational wallets are also excluded when their NUMMUS balance is reserved for protocol operations, such as supplying swaps used to acquire tBTC for the DAO Vault, rather than representing an independent investor position. Treasury, burn and all other owners remain subject to the same balance-ranking rules. Holder count includes every owner with a positive balance and therefore follows an unadjusted inclusion rule.

The reliable historical series begins with the first successfully collected Holder Distribution snapshot. Earlier values are not estimated or copied from current data.

## Chart Interaction

The global range selector applies `1D`, `7D`, `30D`, `1Y` or `ALL` to every historical chart. Each chart also has independent zoom and reset controls.

Charts support mouse drag, horizontal trackpad movement, touch panning and pinch zoom. Their date ticks adapt to the selected period and screen size, while tooltips show the exact date and value represented by the selected point.

Percentage changes shown above the charts are calculated from the first and last valid observations in the currently visible period.

## Projection Simulator

The simulator is visually separated from the historical dashboard because it presents hypothetical scenarios rather than observed data.

Every projection starts from the latest real Vault Value and NUMMUS supply. Future supply is estimated using the average historical burn pace.

```text
Projected NAV = Projected Vault Value / Projected Supply
Projected NUMMUS Price = Projected NAV x Scenario Premium
```

The selected scenario determines the five-year Vault Value multiplier and the historical premium applied to projected NAV:

- **Steady:** Vault Value reaches `5x` after five years and uses the lowest historical premium;
- **Strong:** Vault Value reaches `10x` after five years and uses the arithmetic mean historical premium;
- **Accelerated:** Vault Value reaches `20x` after five years and uses the highest historical premium.

For shorter periods, the selected five-year growth is distributed progressively across the chosen time horizon. As new observations are added, the starting treasury value, supply-reduction pace and historical premium statistics can change, so the projections also update.

The simulator is an analytical tool, not a price forecast, financial advice or a promise of future performance.

## Snapshot Integrity and Update Status

Every daily update is treated as one complete dataset. The collector retrieves and validates Vault Value, supply, NUMMUS price, NAV, backing, premium, tBTC, Market Depth, total DEX liquidity, every tracked pool and Holder Growth before publishing any new observation.

If any required source or metric is unavailable, the attempted update is rejected and neither the daily history nor the latest valid snapshot is replaced. The workflow retries the complete collection three times. If all attempts fail, the GitHub Actions run reports an error while the dashboard continues to display the most recent verified dataset. Failed attempts are never represented as new dates by copying values from the previous day.

The dashboard displays a red warning when the last complete update is more than **48 hours old**. This indicates that the visible values remain the latest verified observations but should no longer be considered current.

## Data Sources

### Blockchain and Governance

- [NUMMUS DAO on Realms](https://app.realms.today/dao/2Czvw7p29thfqNJznuicygBKxh33xoCMuGMH7zbPQ2gp) identifies the DAO and its governance structure.
- [NUMMUS Vault on Solscan](https://solscan.io/account/HtT3yMsAavLQYmd6VSbXSdbAefyZUrrFeEPoTPivde3s) provides a public view of treasury transactions and balances.
- [NUMMUS mint on Solscan](https://solscan.io/token/9JK2U7aEkp3tWaFNuaJowWRgNys5DVaKGxWk73VT5ray) identifies the token mint and current on-chain supply.
- [NUMMUS burn wallet on Solscan](https://solscan.io/account/5G62fW1BuK6k9B6sGwvTBtoKRPseshj9SSYPzudSPUYE) identifies the wallet used by the burn process.
- [Helius Enhanced Transactions](https://www.helius.dev/docs/enhanced-transactions/overview), [transaction history](https://www.helius.dev/docs/enhanced-transactions/transaction-history) and the [Digital Asset Standard API](https://www.helius.dev/docs/api-reference/das) provide indexed Solana transactions, balances and asset metadata.

### Market Prices

- [Jupiter](https://dev.jup.ag/) is the primary source for current Solana token prices.
- [Jupiter Swap quotes](https://dev.jup.ag/docs/swap) provide the current routing and price-impact observations used to measure NUMMUS Buy and Sell Depth.
- Helius asset `price_info` is used when a valid price is available through its asset metadata.
- [DexScreener](https://docs.dexscreener.com/api/reference) provides a decentralized-market fallback.
- [DexScreener token-pair data](https://docs.dexscreener.com/api/reference) supplies the current USD liquidity of the Solana pools included in NUMMUS DEX Liquidity.
- [DefiLlama](https://defillama.com/docs/api) provides current and historical price observations.
- [GeckoTerminal](https://apiguide.geckoterminal.com/) provides historical decentralized-market OHLCV observations where required.
- [NUMMUS on CoinGecko](https://www.coingecko.com/en/coins/nummus-aeternitas) provides an independent public market reference for NUMMUS.

Current fungible-asset pricing follows this order: **Jupiter, Helius price information, DexScreener, then DefiLlama**. The first valid market price is used.

### Historical Treasury Records

- [Nummus VaultDAO](https://github.com/Happydao/Nummus.VaultDAO) supplies committed treasury valuation snapshots for the period in which those records are available.
- Earlier treasury balances are reconstructed from verified on-chain transactions and matched with real historical market observations from the sources listed above.
- [Nummus Burn Dashboard](https://happydao.github.io/Nummus.burn/) provides the public burn-history view associated with supply reduction.

Historical values are not interpolated or invented. When a metric cannot be verified from public blockchain data or a real market observation, it remains unavailable rather than being replaced with an estimate.
