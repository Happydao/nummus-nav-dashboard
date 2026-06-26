import { getAllGovernances, getNativeTreasuryAddress } from "@solana/spl-governance";
import { Connection, PublicKey } from "@solana/web3.js";
import { REALMS_REALM, SPL_GOVERNANCE_PROGRAM_ID } from "./constants.js";
import { getRequiredEnv } from "./env.js";

export interface RealmTreasury {
  governance: string;
  nativeTreasury: string;
}

export interface RealmTreasuryDiscovery {
  realm: string;
  programId: string;
  treasuries: RealmTreasury[];
}

export function getHeliusRpcUrl(apiKey = getRequiredEnv("HELIUS_API_KEY")): string {
  return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
}

export async function discoverRealmTreasuries(
  connection = new Connection(getHeliusRpcUrl())
): Promise<RealmTreasuryDiscovery> {
  const programId = new PublicKey(SPL_GOVERNANCE_PROGRAM_ID);
  const realm = new PublicKey(REALMS_REALM);
  const governances = await getAllGovernances(connection, programId, realm);

  const treasuries = await Promise.all(
    governances.map(async (governance) => ({
      governance: governance.pubkey.toBase58(),
      nativeTreasury: (await getNativeTreasuryAddress(programId, governance.pubkey)).toBase58()
    }))
  );

  return {
    realm: REALMS_REALM,
    programId: SPL_GOVERNANCE_PROGRAM_ID,
    treasuries
  };
}
