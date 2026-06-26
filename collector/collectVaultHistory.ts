import type { CollectionResult, VaultValueSnapshot } from "../src/utils/types.js";

export async function collectVaultHistory(): Promise<CollectionResult<VaultValueSnapshot[]>> {
  return {
    data: [],
    warnings: [
      {
        metric: "vaultUsd",
        message:
          "Historical vault USD cannot be reconstructed reliably from the vault wallet address alone. It requires historical token-account ownership, token balances at each date, LP/position decoding where applicable, and historical USD prices for every held asset."
      }
    ]
  };
}
