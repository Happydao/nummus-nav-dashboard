import type { PricedAsset, UnpricedAsset, ValuationReport } from "../types.js";
import { round } from "../utils/math.js";
import { getTokenPrice } from "./priceProviders.js";
import type { FungibleVaultAsset, IgnoredVaultAsset } from "../sources/vaultAssets.js";

export async function valueVault(
  fungibleAssets: FungibleVaultAsset[],
  ignoredAssets: IgnoredVaultAsset[]
): Promise<{ vaultUsd: number | null; valuationReport: ValuationReport }> {
  const pricedAssets: PricedAsset[] = [];
  const unpricedAssets: UnpricedAsset[] = [];
  let vaultUsd = 0;

  for (const asset of fungibleAssets) {
    const quote = await getTokenPrice(asset.mint, asset.heliusPriceInfo);
    if (!quote) {
      unpricedAssets.push({
        symbol: asset.symbol,
        mint: asset.mint,
        amount: asset.amount,
        reason: "no valid price from Jupiter, Helius price_info, DexScreener, or DefiLlama"
      });
      continue;
    }

    const valueUsd = round(asset.amount * quote.priceUsd) ?? 0;
    vaultUsd += valueUsd;
    pricedAssets.push({
      symbol: asset.symbol,
      mint: asset.mint,
      amount: asset.amount,
      priceUsd: quote.priceUsd,
      valueUsd,
      provider: quote.provider
    });
  }

  return {
    vaultUsd: unpricedAssets.length === 0 ? round(vaultUsd) : null,
    valuationReport: {
      source:
        "Helius DAS current vault assets + Jupiter/Helius/DexScreener/DefiLlama pricing cascade",
      pricedAssets,
      ignoredAssets,
      unpricedAssets
    }
  };
}
