import { discoverRealmTreasuries } from "../src/utils/realms.js";
import type { CollectionResult } from "../src/utils/types.js";
import type { RealmTreasuryDiscovery } from "../src/utils/realms.js";

export async function collectRealmTreasuries(): Promise<
  CollectionResult<RealmTreasuryDiscovery>
> {
  const discovery = await discoverRealmTreasuries();

  return {
    data: discovery,
    warnings:
      discovery.treasuries.length === 0
        ? [
            {
              metric: "vaultUsd",
              message:
                "No native treasury PDA was discovered from the NUMMUS Realms DAO. Vault USD cannot be reconstructed until treasury discovery returns at least one DAO-controlled treasury."
            }
          ]
        : []
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await collectRealmTreasuries();
  console.log(JSON.stringify(result.data, null, 2));
}
