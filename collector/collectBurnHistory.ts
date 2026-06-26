import { BURN_WALLET, NUMMUS_MINT } from "../src/utils/constants.js";
import { SolanaRpcClient } from "../src/utils/solanaRpc.js";
import type { BurnEvent, CollectionResult } from "../src/utils/types.js";

interface SignatureInfo {
  signature: string;
  slot: number;
  err: unknown;
  blockTime: number | null;
}

interface ParsedInstruction {
  parsed?: {
    type?: string;
    info?: {
      mint?: string;
      amount?: string;
    };
  };
}

interface ParsedTransaction {
  slot: number;
  blockTime: number | null;
  meta?: {
    innerInstructions?: Array<{
      instructions: ParsedInstruction[];
    }>;
    preTokenBalances?: Array<{
      mint: string;
      uiTokenAmount: {
        decimals: number;
      };
    }>;
  };
}

export interface BurnCollectionOptions {
  limit?: number;
}

export async function collectBurnHistory(
  rpc = new SolanaRpcClient(),
  options: BurnCollectionOptions = {}
): Promise<CollectionResult<BurnEvent[]>> {
  const limit = options.limit ?? Number(process.env.BURN_SIGNATURE_LIMIT ?? 10);
  const signatures = await rpc.call<SignatureInfo[]>("getSignaturesForAddress", [
    BURN_WALLET,
    { limit }
  ]);

  const events: BurnEvent[] = [];

  for (const signature of signatures.filter((item) => item.err === null)) {
    const transaction = await rpc.call<ParsedTransaction | null>("getTransaction", [
      signature.signature,
      {
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 0
      }
    ]);

    if (!transaction?.blockTime) {
      continue;
    }

    const decimals =
      transaction.meta?.preTokenBalances?.find((balance) => balance.mint === NUMMUS_MINT)
        ?.uiTokenAmount.decimals ?? 6;

    const instructions =
      transaction.meta?.innerInstructions?.flatMap((inner) => inner.instructions) ?? [];

    for (const instruction of instructions) {
      if (
        instruction.parsed?.type === "burn" &&
        instruction.parsed.info?.mint === NUMMUS_MINT &&
        instruction.parsed.info.amount
      ) {
        const rawAmount = instruction.parsed.info.amount;
        events.push({
          signature: signature.signature,
          slot: transaction.slot,
          blockTime: transaction.blockTime,
          date: new Date(transaction.blockTime * 1000).toISOString().slice(0, 10),
          rawAmount,
          decimals,
          amount: Number(rawAmount) / 10 ** decimals
        });
      }
    }
  }

  return {
    data: events,
    warnings: [
      {
        metric: "burn",
        message:
          "Burn events can be reconstructed from parsed SPL-token burn instructions involving the burn wallet and NUMMUS mint, but complete history requires paginating every signature through an archival RPC/indexer."
      }
    ]
  };
}
