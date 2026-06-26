import { WRAPPED_SOL_MINT } from "../src/utils/constants.js";
import { DefiLlamaPriceClient } from "../src/utils/defillama.js";
import { HeliusClient } from "../src/utils/helius.js";
import { round } from "../src/utils/math.js";
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
  };
}

interface BalanceLine {
  mint: string;
  symbol: string | null;
  amount: number;
  coinId: string;
}

export async function collectVaultHistory(
  helius = new HeliusClient(),
  prices = new DefiLlamaPriceClient()
): Promise<CollectionResult<VaultValueSnapshot[]>> {
  const treasuryResult = await collectRealmTreasuries();
  const today = new Date().toISOString().slice(0, 10);
  const balances: BalanceLine[] = [];
  const unpriceableAssets: string[] = [];

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
        amount: nativeSol,
        coinId: `solana:${WRAPPED_SOL_MINT}`
      });
    }

    for (const item of response.items ?? []) {
      const symbol = item.token_info?.symbol ?? item.content?.metadata?.symbol ?? null;
      const decimals = item.token_info?.decimals;
      const rawBalance = Number(item.token_info?.balance);

      if (item.interface !== "FungibleToken" || decimals === undefined || !Number.isFinite(rawBalance)) {
        unpriceableAssets.push(`${symbol ?? item.interface ?? "asset"}:${item.id}`);
        continue;
      }

      balances.push({
        mint: item.id,
        symbol,
        amount: rawBalance / 10 ** decimals,
        coinId: `solana:${item.id}`
      });
    }
  }

  const coinIds = [...new Set(balances.map((balance) => balance.coinId))];
  const priceMap = await prices.getCurrentPrices(coinIds);
  let vaultUsd = 0;
  let pricedAssetCount = 0;

  for (const balance of balances) {
    const price = priceMap.get(balance.coinId);
    if (!price) {
      unpriceableAssets.push(`${balance.symbol ?? "token"}:${balance.mint}`);
      continue;
    }

    pricedAssetCount += 1;
    vaultUsd += balance.amount * price.priceUsd;
  }

  const unpricedAssetCount = unpriceableAssets.length;
  const completeVaultUsd = unpricedAssetCount === 0 ? round(vaultUsd) : null;

  return {
    data: [
      {
        date: today,
        vaultUsd: completeVaultUsd,
        source: "Realms DAO treasury discovery + Helius DAS current balances + DefiLlama current prices",
        pricedAssetCount,
        unpricedAssetCount
      }
    ],
    warnings: [
      ...treasuryResult.warnings,
      {
        metric: "vaultUsd",
        message:
          "Vault collection now starts from the NUMMUS Realms DAO, enumerates governance native treasury PDAs, and reads current treasury assets through Helius DAS. This produces a current-day snapshot only; historical daily Vault USD requires transaction replay plus same-date prices."
      },
      ...(unpricedAssetCount > 0
        ? [
            {
              metric: "vaultUsd" as const,
              message: `Current vaultUsd was left null because ${unpricedAssetCount} treasury asset(s) could not be priced by the current fungible-token policy: ${unpriceableAssets.join(", ")}.`
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
