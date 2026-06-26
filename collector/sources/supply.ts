import { NUMMUS_MINT } from "../utils/constants.js";
import { HeliusClient } from "./helius.js";

interface TokenSupplyResponse {
  value: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
  };
}

export async function getCurrentSupply(helius = new HeliusClient()): Promise<number> {
  const supply = await helius.rpc<TokenSupplyResponse>("getTokenSupply", [NUMMUS_MINT]);
  return supply.value.uiAmount ?? Number(supply.value.amount) / 10 ** supply.value.decimals;
}
