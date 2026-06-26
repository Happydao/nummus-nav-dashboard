import { NUMMUS_MINT } from "../src/utils/constants.js";
import { HeliusClient } from "../src/utils/helius.js";
import type { CollectionResult, SupplySnapshot } from "../src/utils/types.js";

interface TokenSupplyResponse {
  context: {
    slot: number;
  };
  value: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  };
}

export async function collectSupplyHistory(
  helius = new HeliusClient()
): Promise<CollectionResult<SupplySnapshot[]>> {
  const currentSupply = await helius.rpc<TokenSupplyResponse>("getTokenSupply", [NUMMUS_MINT]);

  const uiAmount =
    currentSupply.value.uiAmount ??
    Number(currentSupply.value.amount) / 10 ** currentSupply.value.decimals;

  return {
    data: [
      {
        date: new Date().toISOString().slice(0, 10),
        slot: currentSupply.context.slot,
        rawAmount: currentSupply.value.amount,
        decimals: currentSupply.value.decimals,
        uiAmount
      }
    ],
    warnings: [
      {
        metric: "supply",
        message:
          "Helius RPC getTokenSupply exposes the current token supply. Daily historical supply requires replaying all mint and burn instructions for the NUMMUS mint from complete Helius transaction history; this collector does not synthesize missing history."
      }
    ]
  };
}
