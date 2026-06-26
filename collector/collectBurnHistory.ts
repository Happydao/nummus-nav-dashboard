import { BURN_WALLET, NUMMUS_MINT } from "../src/utils/constants.js";
import { HeliusClient } from "../src/utils/helius.js";
import type { BurnEvent, CollectionResult } from "../src/utils/types.js";

interface HeliusEnhancedTransaction {
  signature: string;
  slot: number;
  timestamp: number;
  transactionError: unknown;
  tokenTransfers?: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    tokenAmount: number;
    mint: string;
  }>;
  accountData?: Array<{
    tokenBalanceChanges?: Array<{
      userAccount?: string;
      mint: string;
      rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
      };
    }>;
  }>;
}

export interface BurnCollectionOptions {
  limit?: number;
}

export async function collectBurnHistory(
  helius = new HeliusClient(),
  options: BurnCollectionOptions = {}
): Promise<CollectionResult<BurnEvent[]>> {
  const limit = options.limit ?? Number(process.env.BURN_SIGNATURE_LIMIT ?? 10);
  const transactions = await helius.getEnhancedTransactionsByAddress<HeliusEnhancedTransaction>(
    BURN_WALLET,
    { limit }
  );

  const events: BurnEvent[] = [];

  for (const transaction of transactions.filter((item) => item.transactionError === null)) {
    const outgoingBurn = transaction.tokenTransfers?.find(
      (transfer) =>
        transfer.mint === NUMMUS_MINT &&
        transfer.fromUserAccount === BURN_WALLET &&
        !transfer.toUserAccount
    );

    if (!outgoingBurn) {
      continue;
    }

    const rawBalanceChange = transaction.accountData
      ?.flatMap((account) => account.tokenBalanceChanges ?? [])
      .find(
        (change) =>
          change.mint === NUMMUS_MINT &&
          change.userAccount === BURN_WALLET &&
          Number(change.rawTokenAmount.tokenAmount) < 0
      );

    const decimals = rawBalanceChange?.rawTokenAmount.decimals ?? 6;
    const rawAmount =
      rawBalanceChange?.rawTokenAmount.tokenAmount.replace(/^-/, "") ??
      String(Math.round(outgoingBurn.tokenAmount * 10 ** decimals));

    events.push({
      signature: transaction.signature,
      slot: transaction.slot,
      blockTime: transaction.timestamp,
      date: new Date(transaction.timestamp * 1000).toISOString().slice(0, 10),
      rawAmount,
      decimals,
      amount: Number(rawAmount) / 10 ** decimals
    });
  }

  return {
    data: events,
    warnings: [
      {
        metric: "burn",
        message:
          "Burn events are reconstructed from Helius Enhanced Transactions for the burn wallet. Complete history requires paginating all burn-wallet transactions with the before cursor and validating that no NUMMUS burns occur outside the documented burn wallet."
      }
    ]
  };
}
