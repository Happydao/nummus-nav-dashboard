import { ZEC_MINT, VAULT_WALLET } from "../utils/constants.js";
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
  for (const item of response.items ?? []) {
    if (item.id !== ZEC_MINT) continue;

    const symbol = item.token_info?.symbol ?? item.content?.metadata?.symbol ?? null;

    if (item.interface !== "FungibleToken" && item.interface !== "FungibleAsset") {
      ignoredAssets.push({
        symbol,
        mint: item.id,
        reason: `ignored ${item.interface ?? "non-fungible asset"} received by treasury`
      });
      continue;
    }

    const decimals = item.token_info?.decimals;
    const balance = Number(item.token_info?.balance);
    if (decimals === undefined || !Number.isInteger(decimals) || decimals < 0 || !Number.isFinite(balance) || balance < 0) {
      ignoredAssets.push({
        symbol,
        mint: item.id,
        reason: "ignored fungible asset with missing balance metadata"
      });
      continue;
    }

    fungibleAssets.push({
      symbol: "ZEC",
      mint: item.id,
      amount: balance / 10 ** decimals,
      heliusPriceInfo: item.token_info?.price_info
    });
  }

  if (!fungibleAssets.length) {
    throw new Error("Configured ZEC mint has no verifiable vault balance; valuation unavailable");
  }
  return { fungibleAssets, ignoredAssets };
}
