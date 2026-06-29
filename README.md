# NUMMUS NAV Dashboard

The NUMMUS NAV Dashboard tracks the evolution of the treasury value supporting NUMMUS.

It is not a treasury-composition dashboard. Its purpose is to show the historical relationship between:

- the treasury's USD value;
- the circulating NUMMUS supply;
- the treasury value attributable to each token;
- the NUMMUS market price;
- supply reduction;
- tBTC accumulation.

Current data is recorded through recurring snapshots and retained to build a verifiable historical series.

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

The collector discovers each threshold through progressively larger Jupiter quotes followed by a binary search around the limit. The metric reflects all routes returned by Jupiter rather than the reported TVL of a single pool. It remains an instantaneous quote observation: route availability and execution conditions can change before a transaction is submitted.

Historical Jupiter quotes cannot be reconstructed reliably. This series therefore begins with the first daily market-depth snapshot and does not backfill earlier dates.

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
- [DefiLlama](https://defillama.com/docs/api) provides current and historical price observations.
- [GeckoTerminal](https://apiguide.geckoterminal.com/) provides historical decentralized-market OHLCV observations where required.
- [NUMMUS on CoinGecko](https://www.coingecko.com/en/coins/nummus-aeternitas) provides an independent public market reference for NUMMUS.

Current fungible-asset pricing follows this order: **Jupiter, Helius price information, DexScreener, then DefiLlama**. The first valid market price is used.

### Historical Treasury Records

- [Nummus VaultDAO](https://github.com/Happydao/Nummus.VaultDAO) supplies committed treasury valuation snapshots for the period in which those records are available.
- Earlier treasury balances are reconstructed from verified on-chain transactions and matched with real historical market observations from the sources listed above.
- [Nummus Burn Dashboard](https://happydao.github.io/Nummus.burn/) provides the public burn-history view associated with supply reduction.

Historical values are not interpolated or invented. When a metric cannot be verified from public blockchain data or a real market observation, it remains unavailable rather than being replaced with an estimate.
