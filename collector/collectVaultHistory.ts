import { VAULT_WALLET } from "../src/utils/constants.js";
import { HeliusClient } from "../src/utils/helius.js";
import type { CollectionResult, VaultValueSnapshot } from "../src/utils/types.js";

interface HeliusAssetsByOwnerResponse {
  total?: number;
  nativeBalance?: {
    lamports: number;
    price_per_sol?: number;
    total_price?: number;
  };
}

export async function collectVaultHistory(
  helius = new HeliusClient()
): Promise<CollectionResult<VaultValueSnapshot[]>> {
  await helius.rpc<HeliusAssetsByOwnerResponse>("getAssetsByOwner", {
    ownerAddress: VAULT_WALLET,
    page: 1,
    limit: 1000,
    displayOptions: {
      showFungible: true,
      showNativeBalance: true
    }
  });

  return {
    data: [],
    warnings: [
      {
        metric: "vaultUsd",
        message:
          "Helius DAS getAssetsByOwner exposes the current vault wallet assets and native SOL value, but it does not provide a complete historical USD wallet valuation. Historical vaultUsd remains null until a valuation layer snapshots or backfills every vault asset with same-date prices."
      }
    ]
  };
}
