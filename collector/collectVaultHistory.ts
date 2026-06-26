import { WRAPPED_SOL_MINT } from "../src/utils/constants.js";
import { HeliusClient } from "../src/utils/helius.js";
import { round } from "../src/utils/math.js";
import { TreasuryPriceClient, type HeliusPriceInfo } from "../src/utils/treasuryPricing.js";
import type { CollectionResult, VaultValueSnapshot } from "../src/utils/types.js";
import { collectRealmTreasuries } from "./collectRealmTreasuries.js";

interface HeliusAssetsByOwnerResponse {
  total?: number;
  nativeBalance?: {
    lamports: number;
    price_per_sol?: number;
    total_price?: number;
  };
  items?: HeliusAsset[];
}

interface HeliusAsset {
  id: string;
  interface?: string;
  content?: {
    metadata?: {
      symbol?: string;
    };
  };
  token_info?: {
    balance?: number | string;
    decimals?: number;
    symbol?: string;
    price_info?: HeliusPriceInfo;
  };
}

interface BalanceLine {
  mint: string;
  symbol: string | null;
  amount: number;
  heliusPriceInfo?: HeliusPriceInfo;
}

interface IgnoredAsset {
  symbol: string | null;
  mint: string;
  reason: string;
}

export async function collectVaultHistory(
  helius = new HeliusClient(),
  prices = new TreasuryPriceClient()
): Promise<CollectionResult<VaultValueSnapshot[]>> {
  const treasuryResult = await collectRealmTreasuries();
  const today = new Date().toISOString().slice(0, 10);
  const balances: BalanceLine[] = [];
  const ignoredAssets: IgnoredAsset[] = [];
  const unpricedAssets: IgnoredAsset[] = [];

  for (const treasury of treasuryResult.data.treasuries) {
    const response = await helius.rpc<HeliusAssetsByOwnerResponse>("getAssetsByOwner", {
      ownerAddress: treasury.nativeTreasury,
      page: 1,
      limit: 1000,
      displayOptions: {
        showFungible: true,
        showNativeBalance: true
      }
    });

    const nativeSol = (response.nativeBalance?.lamports ?? 0) / 1_000_000_000;
    if (nativeSol > 0) {
      balances.push({
        mint: WRAPPED_SOL_MINT,
        symbol: "SOL",
        amount: nativeSol
      });
    }

    for (const item of response.items ?? []) {
      const symbol = item.token_info?.symbol ?? item.content?.metadata?.symbol ?? null;
      const decimals = item.token_info?.decimals;
      const rawBalance = Number(item.token_info?.balance);

      if (item.interface !== "FungibleToken") {
        ignoredAssets.push({
          symbol,
          mint: item.id,
          reason: `ignored ${item.interface ?? "non-fungible asset"} received by treasury`
        });
        continue;
      }

      if (decimals === undefined || !Number.isFinite(rawBalance)) {
        unpricedAssets.push({
          symbol,
          mint: item.id,
          reason: "missing fungible balance or decimals from Helius DAS"
        });
        continue;
      }

      balances.push({
        mint: item.id,
        symbol,
        amount: rawBalance / 10 ** decimals,
        heliusPriceInfo: item.token_info?.price_info
      });
    }
  }

  let vaultUsd = 0;
  const valuedAssets: NonNullable<VaultValueSnapshot["valuedAssets"]> = [];

  for (const balance of balances) {
    const price = await prices.getPrice(balance.mint, balance.heliusPriceInfo);
    if (!price) {
      unpricedAssets.push({
        symbol: balance.symbol,
        mint: balance.mint,
        reason: "no valid price from Jupiter, Helius, DexScreener, or DefiLlama"
      });
      continue;
    }

    const valueUsd = round(balance.amount * price.priceUsd) ?? 0;
    vaultUsd += valueUsd;
    valuedAssets.push({
      symbol: balance.symbol,
      mint: balance.mint,
      amount: balance.amount,
      priceUsd: price.priceUsd,
      valueUsd,
      provider: price.provider
    });
  }

  const unpricedAssetCount = unpricedAssets.length;
  const completeVaultUsd = unpricedAssetCount === 0 ? round(vaultUsd) : null;

  return {
    data: [
      {
        date: today,
        vaultUsd: completeVaultUsd,
        source:
          "Realms DAO treasury discovery + Helius DAS current balances + Jupiter/Helius/DexScreener/DefiLlama pricing cascade",
        pricedAssetCount: valuedAssets.length,
        ignoredAssetCount: ignoredAssets.length,
        unpricedAssetCount,
        valuedAssets,
        ignoredAssets,
        unpricedAssets
      }
    ],
    warnings: [
      ...treasuryResult.warnings,
      {
        metric: "vaultUsd",
        message:
          "Vault collection starts from the NUMMUS Realms DAO, enumerates governance native treasury PDAs, reads current treasury assets through Helius DAS, ignores non-fungible spam/scam assets, and prices fungible assets through Jupiter, Helius, DexScreener, then DefiLlama. This produces a current-day snapshot only; historical daily Vault USD requires transaction replay plus same-date prices."
      },
      ...(unpricedAssetCount > 0
        ? [
            {
              metric: "vaultUsd" as const,
              message: `Current vaultUsd was left null because ${unpricedAssetCount} fungible treasury asset(s) could not be priced by Jupiter, Helius, DexScreener, or DefiLlama: ${unpricedAssets.map((asset) => `${asset.symbol ?? "token"}:${asset.mint}`).join(", ")}.`
            }
          ]
        : [])
    ]
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await collectVaultHistory();
  console.log(JSON.stringify(result, null, 2));
}
