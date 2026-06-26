import { VAULT_WALLET, WRAPPED_SOL_MINT } from "../utils/constants.js";
import { HeliusClient } from "./helius.js";

export interface HeliusPriceInfo {
  price_per_token?: number;
  total_price?: number;
}

export interface FungibleVaultAsset {
  symbol: string | null;
  mint: string;
  amount: number;
  heliusPriceInfo?: HeliusPriceInfo;
}

export interface IgnoredVaultAsset {
  symbol: string | null;
  mint: string;
  reason: string;
}

interface HeliusAssetsByOwnerResponse {
  nativeBalance?: {
    lamports: number;
    price_per_sol?: number;
    total_price?: number;
  };
  items?: Array<{
    id: string;
    interface?: string;
    content?: {
      metadata?: {
        symbol?: string;
      };
    };
    token_info?: {
      symbol?: string;
      balance?: number | string;
      decimals?: number;
      price_info?: HeliusPriceInfo;
    };
  }>;
}

export async function getCurrentVaultAssets(
  helius = new HeliusClient()
): Promise<{ fungibleAssets: FungibleVaultAsset[]; ignoredAssets: IgnoredVaultAsset[] }> {
  const response = await helius.rpc<HeliusAssetsByOwnerResponse>("getAssetsByOwner", {
    ownerAddress: VAULT_WALLET,
    page: 1,
    limit: 1000,
    displayOptions: {
      showFungible: true,
      showNativeBalance: true
    }
  });

  const fungibleAssets: FungibleVaultAsset[] = [];
  const ignoredAssets: IgnoredVaultAsset[] = [];
  const nativeSol = (response.nativeBalance?.lamports ?? 0) / 1_000_000_000;

  if (nativeSol > 0) {
    fungibleAssets.push({
      symbol: "SOL",
      mint: WRAPPED_SOL_MINT,
      amount: nativeSol,
      heliusPriceInfo:
        response.nativeBalance?.price_per_sol && response.nativeBalance.price_per_sol > 0
          ? { price_per_token: response.nativeBalance.price_per_sol }
          : undefined
    });
  }

  for (const item of response.items ?? []) {
    const symbol = item.token_info?.symbol ?? item.content?.metadata?.symbol ?? null;

    if (item.interface !== "FungibleToken") {
      ignoredAssets.push({
        symbol,
        mint: item.id,
        reason: `ignored ${item.interface ?? "non-fungible asset"} received by treasury`
      });
      continue;
    }

    const decimals = item.token_info?.decimals;
    const balance = Number(item.token_info?.balance);
    if (decimals === undefined || !Number.isFinite(balance)) {
      ignoredAssets.push({
        symbol,
        mint: item.id,
        reason: "ignored fungible asset with missing balance metadata"
      });
      continue;
    }

    fungibleAssets.push({
      symbol,
      mint: item.id,
      amount: balance / 10 ** decimals,
      heliusPriceInfo: item.token_info?.price_info
    });
  }

  return { fungibleAssets, ignoredAssets };
}
